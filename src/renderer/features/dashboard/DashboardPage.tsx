import { Card, CardDescription, CardHeader, CardTitle } from "@renderer/components/ui/card";

export function DashboardPage(){
  return (
    <div className='p-4'>
      <Card>
        <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
      </CardHeader>
      </Card>
    </div>
  )
}
