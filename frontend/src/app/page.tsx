import { Dashboard } from "@/components/dashboard";
import { projects } from "@/config/projects";

export default function Home() {
  return <Dashboard projects={projects} />;
}
