/**
 * Deterministic resume-text parser for the parse-only (no LLM) import mode.
 *
 * Replaces the old behaviour that hard-coded the candidate identity and dumped
 * raw text into `summary`. This builds a full imported-resume document from
 * extracted PDF/DOCX text using layout heuristics (contact regexes, section
 * headings, date ranges, bullet lists) so imported resumes keep real detail.
 */

const SECTION_ALIASES: Array<{ key: string; aliases: string[] }> = [
  {
    key: "summary",
    aliases: [
      "summary",
      "professional summary",
      "profile summary",
      "objective",
      "career objective",
      "about me",
      "about",
      "profile",
    ],
  },
  {
    key: "experience",
    aliases: [
      "experience",
      "work experience",
      "professional experience",
      "employment",
      "employment history",
      "work history",
      "career history",
    ],
  },
  {
    key: "education",
    aliases: ["education", "academic background", "academics", "academic"],
  },
  {
    key: "projects",
    aliases: ["projects", "project", "portfolio", "personal projects"],
  },
  {
    key: "skills",
    aliases: [
      "skills",
      "technical skills",
      "core skills",
      "technologies",
      "tech stack",
      "competencies",
      "core competencies",
    ],
  },
  {
    key: "languages",
    aliases: ["languages", "language proficiency", "spoken languages"],
  },
  {
    key: "certifications",
    aliases: [
      "certifications",
      "certificates",
      "licenses",
      "courses",
      "training",
      "certification",
    ],
  },
  {
    key: "awards",
    aliases: ["awards", "honors", "achievements", "accomplishments", "honours"],
  },
  {
    key: "interests",
    aliases: ["interests", "hobbies", "activities", "extracurricular"],
  },
  { key: "publications", aliases: ["publications", "research", "papers"] },
  {
    key: "volunteer",
    aliases: ["volunteer", "volunteering", "community involvement"],
  },
  { key: "references", aliases: ["references", "referees"] },
  {
    key: "profiles",
    aliases: ["links", "social", "online presence", "web presence"],
  },
];

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_TOKEN = `(?:${MONTHS})[a-z]*\\.?\\s+\\d{4}|\\d{1,2}\\/\\d{4}|\\d{4}`;
const DATE_RANGE_PATTERN = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|\u2013|\u2014|to|until)\\s*(${DATE_TOKEN}|present|current|now|sekarang)`,
  "i",
);
const SINGLE_DATE_PATTERN = new RegExp(`(${DATE_TOKEN})`, "i");

function normalizeLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isContactLikeLine(value: string): boolean {
  return (
    /@/.test(value) ||
    /\d{3}/.test(value) ||
    /https?:\/\//i.test(value) ||
    /linkedin|github|gitlab|medium|dribbble|behance/i.test(value)
  );
}

function findSectionKey(line: string): string | null {
  const cleaned = line
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s&/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > 40) return null;

  for (const entry of SECTION_ALIASES) {
    const matched = entry.aliases.some(
      (alias) => cleaned === alias || cleaned.startsWith(`${alias} `),
    );
    if (matched) return entry.key;
  }
  return null;
}

function extractPeriod(line: string): { period: string; rest: string } {
  const match = line.match(DATE_RANGE_PATTERN);
  if (!match) return { period: "", rest: normalizeLine(line) };
  const period = `${match[1].trim()} - ${match[2].trim()}`;
  return { period, rest: normalizeLine(line.replace(match[0], " ")) };
}

function stripBullet(line: string): string {
  return normalizeLine(line.replace(/^[-*]/, ""));
}

function isBullet(line: string): boolean {
  return /^[-*]/.test(line);
}

function linesToRichText(lines: string[]): string {
  const cleaned = lines.map(stripBullet).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return `<p>${cleaned[0]}</p>`;
  return `<ul>${cleaned.map((entry) => `<li>${entry}</li>`).join("")}</ul>`;
}

function groupBlocks(lines: string[]): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const previous = current[current.length - 1] ?? "";
    // A new entry starts when a bullet list ends (description finished) or when
    // two date lines appear back to back. Date lines otherwise belong to the
    // title line above them.
    const startsNewBlock =
      current.length > 0 &&
      ((isBullet(previous) && !isBullet(line)) ||
        (DATE_RANGE_PATTERN.test(previous) && DATE_RANGE_PATTERN.test(line)));

    if (startsNewBlock) {
      blocks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current);
  return blocks.filter((block) => block.length > 0);
}

/**
 * Split a block into the period (first line containing a date range), the
 * remaining lines, and the description lines.
 */
function splitBlock(block: string[]): {
  period: string;
  title: string;
  detail: string;
  rest: string[];
} {
  const dateIndex = block.findIndex((line) => DATE_RANGE_PATTERN.test(line));
  const period =
    dateIndex >= 0 ? extractPeriod(block[dateIndex] ?? "").period : "";
  const withoutDate = block.filter((_, index) => index !== dateIndex);
  const title = withoutDate[0] ?? "";
  const detail = withoutDate[1] ?? "";
  return { period, title, detail, rest: withoutDate.slice(1) };
}

function buildExperience(lines: string[]): unknown[] {
  return groupBlocks(lines).map((block) => {
    const { period, title, detail, rest } = splitBlock(block);
    let position = title;
    let company = "";
    let descriptionLines = rest;

    const atMatch = title.match(/^(.*?)\s+(?:at|@)\s+(.*)$/i);
    if (atMatch) {
      position = normalizeLine(atMatch[1]);
      company = normalizeLine(atMatch[2]);
    } else if (title.includes("|")) {
      const parts = title.split("|").map((part) => normalizeLine(part));
      position = parts[0] ?? "";
      company = parts[1] ?? "";
    } else if (detail && !isBullet(detail)) {
      company = normalizeLine(detail);
      descriptionLines = rest.slice(1);
    }

    return {
      id: "",
      hidden: false,
      company,
      position,
      location: "",
      period,
      website: { url: "", label: "" },
      description: linesToRichText(descriptionLines),
      roles: [],
      options: { showLinkInTitle: false },
    };
  });
}

function buildEducation(lines: string[]): unknown[] {
  return groupBlocks(lines).map((block) => {
    const { period, title, detail, rest } = splitBlock(block);
    const hasDetail = detail && !isBullet(detail);
    const degree = hasDetail ? normalizeLine(detail) : "";
    const descriptionLines = hasDetail ? rest.slice(1) : rest;

    return {
      id: "",
      hidden: false,
      school: title,
      degree,
      area: "",
      grade: "",
      location: "",
      period,
      website: { url: "", label: "" },
      description: linesToRichText(descriptionLines),
      options: { showLinkInTitle: false },
    };
  });
}

function buildProjects(lines: string[]): unknown[] {
  return groupBlocks(lines).map((block) => {
    const { period, title, rest } = splitBlock(block);
    const urlMatch = title.match(/https?:\/\/[^\s,)]+/i);
    const website = urlMatch?.[0] ?? "";
    const name = normalizeLine(title.replace(/https?:\/\/[^\s,)]+/i, ""));

    return {
      id: "",
      hidden: false,
      name,
      period,
      website: { url: website, label: "" },
      description: linesToRichText(rest),
      options: { showLinkInTitle: false },
    };
  });
}

function buildSkills(lines: string[]): unknown[] {
  const items: unknown[] = [];
  for (const line of lines) {
    const categoryMatch = line.match(/^(.{2,40}?)\s*[:]\s*(.+)$/);
    if (categoryMatch) {
      items.push({
        id: "",
        hidden: false,
        icon: "",
        name: normalizeLine(categoryMatch[1]),
        proficiency: "",
        level: 0,
        keywords: categoryMatch[2]
          .split(/[,;|]/)
          .map((entry) => normalizeLine(entry))
          .filter(Boolean),
      });
      continue;
    }
    for (const token of line.split(/[,;|]/)) {
      const name = stripBullet(token);
      if (!name) continue;
      items.push({
        id: "",
        hidden: false,
        icon: "",
        name,
        proficiency: "",
        level: 0,
        keywords: [],
      });
    }
  }
  return items;
}

function buildLanguages(lines: string[]): unknown[] {
  return lines
    .flatMap((line) => line.split(/[,;|]/))
    .map((entry) => stripBullet(entry))
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(.{2,30}?)\s*[-(\u2013\u2014]\s*(.+?)\)?$/);
      return {
        id: "",
        hidden: false,
        language: match ? normalizeLine(match[1]) : entry,
        fluency: match ? normalizeLine(match[2]) : "",
        level: 0,
      };
    });
}

function buildDatedItems(
  lines: string[],
  shape: "certifications" | "awards",
): unknown[] {
  return lines
    .map((line) => stripBullet(line))
    .filter(Boolean)
    .map((line) => {
      const date = line.match(SINGLE_DATE_PATTERN)?.[1] ?? "";
      const withoutDate = date
        ? normalizeLine(line.replace(SINGLE_DATE_PATTERN, " "))
        : line;
      const parts = withoutDate.split(/\s+[-|]\s+|\s+at\s+/i);
      const title = normalizeLine(parts[0] ?? withoutDate);
      // Drop empty parentheses left behind after removing the date (e.g. "Amazon ( )")
      const right = normalizeLine((parts[1] ?? "").replace(/\(\s*\)/g, ""));
      const base = {
        id: "",
        hidden: false,
        title,
        date,
        website: { url: "", label: "" },
        description: "",
        options: { showLinkInTitle: false },
      };
      return shape === "certifications"
        ? { ...base, issuer: right }
        : { ...base, awarder: right };
    });
}

function buildNamedItems(
  lines: string[],
  nameKey: string,
  withKeywords: boolean,
): unknown[] {
  return lines
    .map((line) => stripBullet(line))
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.{2,60}?)\s*[:]\s*(.+)$/);
      const name = match ? normalizeLine(match[1]) : line;
      const keywords = match
        ? match[2]
            .split(/[,;|]/)
            .map((entry) => normalizeLine(entry))
            .filter(Boolean)
        : [];
      if (withKeywords) {
        return { id: "", hidden: false, icon: "", [nameKey]: name, keywords };
      }
      return { id: "", hidden: false, [nameKey]: name };
    });
}

function buildProfiles(
  linkedin: string,
  github: string,
  website: string,
): unknown[] {
  const profiles: unknown[] = [];
  const push = (network: string, url: string, username: string): void => {
    if (!url) return;
    profiles.push({
      id: "",
      hidden: false,
      icon: network.toLowerCase(),
      network,
      username,
      website: { url, label: "" },
      options: { showLinkInTitle: false },
    });
  };

  if (linkedin) {
    push(
      "LinkedIn",
      linkedin.startsWith("http") ? linkedin : `https://${linkedin}`,
      linkedin.split("/").filter(Boolean).pop() ?? "",
    );
  }
  if (github) {
    push(
      "GitHub",
      github.startsWith("http") ? github : `https://${github}`,
      github.split("/").filter(Boolean).pop() ?? "",
    );
  }
  if (website) push("Website", website, "");
  return profiles;
}

export function parseResumeTextToImportedJson(args: {
  text: string;
  fileName?: string | null;
}): Record<string, unknown> {
  const rawText = (args.text ?? "").replace(/\r\n?/g, "\n");
  const lines = rawText
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const email = rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
  const phone = rawText.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1]?.trim() ?? "";
  const linkedin =
    rawText.match(/(?:www\.)?linkedin\.com\/(?:in|pub)\/[\w-]+\/?/i)?.[0] ?? "";
  const github = rawText.match(/(?:www\.)?github\.com\/[\w-]+\/?/i)?.[0] ?? "";
  const website =
    rawText.match(
      /https?:\/\/(?!(?:www\.)?(?:linkedin|github)\.com)[^\s,)]+/i,
    )?.[0] ?? "";

  const sections = new Map<string, string[]>();
  const headerLines: string[] = [];
  let currentKey: string | null = null;

  for (const line of lines) {
    const key = findSectionKey(line);
    if (key) {
      currentKey = key;
      if (!sections.has(key)) sections.set(key, []);
      continue;
    }
    if (currentKey) sections.get(currentKey)?.push(line);
    else headerLines.push(line);
  }

  const identityLines = headerLines.filter((line) => !isContactLikeLine(line));
  const name = identityLines[0] ?? "";
  const headline =
    identityLines.find((line, index) => index > 0 && line !== name) ?? "";
  const location =
    rawText.match(
      /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*,\s*(?:[A-Z]{2}\b|[A-Z][a-zA-Z]+))\b/,
    )?.[1] ?? "";

  const summaryLines = sections.get("summary") ?? [];
  const summaryContent =
    summaryLines.length > 0
      ? summaryLines.join(" ")
      : identityLines.slice(2).join(" ");

  return {
    picture: {
      hidden: false,
      url: "",
      size: 80,
      rotation: 0,
      aspectRatio: 1,
      borderRadius: 0,
      borderColor: "rgba(0, 0, 0, 0.5)",
      borderWidth: 0,
      shadowColor: "rgba(0, 0, 0, 0.5)",
      shadowWidth: 0,
    },
    basics: {
      name,
      headline,
      email,
      phone,
      location,
      website: { url: website, label: "" },
      customFields: [],
    },
    summary: {
      title: "Summary",
      columns: 1,
      hidden: !summaryContent,
      content: summaryContent ? `<p>${summaryContent}</p>` : "",
    },
    sections: {
      profiles: {
        title: "Profiles",
        columns: 1,
        hidden: false,
        items: buildProfiles(linkedin, github, website),
      },
      experience: {
        title: "Experience",
        columns: 1,
        hidden: false,
        items: buildExperience(sections.get("experience") ?? []),
      },
      education: {
        title: "Education",
        columns: 1,
        hidden: false,
        items: buildEducation(sections.get("education") ?? []),
      },
      projects: {
        title: "Projects",
        columns: 1,
        hidden: false,
        items: buildProjects(sections.get("projects") ?? []),
      },
      skills: {
        title: "Skills",
        columns: 1,
        hidden: false,
        items: buildSkills(sections.get("skills") ?? []),
      },
      languages: {
        title: "Languages",
        columns: 1,
        hidden: false,
        items: buildLanguages(sections.get("languages") ?? []),
      },
      interests: {
        title: "Interests",
        columns: 1,
        hidden: false,
        items: buildNamedItems(sections.get("interests") ?? [], "name", true),
      },
      awards: {
        title: "Awards",
        columns: 1,
        hidden: false,
        items: buildDatedItems(sections.get("awards") ?? [], "awards"),
      },
      certifications: {
        title: "Certifications",
        columns: 1,
        hidden: false,
        items: buildDatedItems(
          sections.get("certifications") ?? [],
          "certifications",
        ),
      },
      publications: {
        title: "Publications",
        columns: 1,
        hidden: false,
        items: buildNamedItems(
          sections.get("publications") ?? [],
          "name",
          false,
        ),
      },
      volunteer: {
        title: "Volunteering",
        columns: 1,
        hidden: false,
        items: buildNamedItems(
          sections.get("volunteer") ?? [],
          "organization",
          false,
        ),
      },
      references: {
        title: "References",
        columns: 1,
        hidden: false,
        items: buildNamedItems(sections.get("references") ?? [], "name", false),
      },
    },
  };
}
