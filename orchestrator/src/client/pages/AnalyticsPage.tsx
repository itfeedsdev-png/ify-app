import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, PageMain } from "../components/layout";
import { TracerLinksPage } from "./TracerLinksPage";
import { WatchlistPage } from "./WatchlistPage";

export const AnalyticsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("tracer");

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="Tracer links and watchlist insights in one place"
      />
      <PageMain>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="tracer">Tracer Links</TabsTrigger>
            <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
          </TabsList>
          <TabsContent
            value="tracer"
            className="mt-6 [&>header]:hidden [&>div>header]:hidden"
          >
            <div className="[&_header]:hidden">
              <TracerLinksPage />
            </div>
          </TabsContent>
          <TabsContent
            value="watchlist"
            className="mt-6 [&>header]:hidden [&>div>header]:hidden"
          >
            <div className="[&_header]:hidden">
              <WatchlistPage />
            </div>
          </TabsContent>
        </Tabs>
      </PageMain>
    </>
  );
};
