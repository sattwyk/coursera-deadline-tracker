import { useState } from "react";
import { Button } from "@/components/ui/8bit/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/8bit/card";
import { Input } from "@/components/ui/8bit/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/8bit/tabs";

function App() {
  const [url, setUrl] = useState("");

  return (
    <div className="w-[400px] min-h-[500px] bg-background p-4">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-xl">Coursera Scraper</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Extract course content from Coursera</p>
          <div className="space-y-3">
            <Input
              placeholder="Enter Coursera course URL..."
              value={url}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
            />
            <Button className="w-full" variant="default">
              Start Scraping
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="courses" className="gap-4">
        <TabsList className="w-full">
          <TabsTrigger value="courses">Courses</TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="courses">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground text-center">No courses scraped yet</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="progress">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Courses</span>
                  <span>0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Downloaded</span>
                  <span>0</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Auto-scrape</span>
                <Button size="sm" variant="secondary">
                  Off
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Download videos</span>
                <Button size="sm" variant="secondary">
                  On
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App;
