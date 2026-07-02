import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>TS3 Manager</CardTitle>
          <CardDescription>
            New React + shadcn dashboard is running.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full">Continue</Button>
        </CardContent>
      </Card>
    </main>
  )
}