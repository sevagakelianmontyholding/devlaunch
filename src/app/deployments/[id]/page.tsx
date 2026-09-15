import { DeploymentView } from "@/components/deployment-view";

export default async function DeploymentPage({ params }: PageProps<"/deployments/[id]">) {
  const { id } = await params;
  return <DeploymentView id={id} />;
}
