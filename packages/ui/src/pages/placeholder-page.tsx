import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type PlaceholderPageProps = {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page is mapped from the original TS3 Manager UI and will be
            redesigned later.
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
