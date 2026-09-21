import ProjectEditor from './components/editor/ProjectEditor'
import ModelUploader from './components/upload/ModelUploader'
import { ExperienceProvider } from './experience/ExperienceProvider'
import { useExperience } from './experience/experienceStore'

/**
 * No project yet: the Phase 1 upload screen, unchanged. The first model
 * uploaded becomes the project's Masterplan view and opens in the editor.
 *
 * A project already in storage skips straight to the editor — its views are
 * remembered, but their files are not, and the editor asks for them.
 */
function AppShell() {
  const { project, createProject, loadDemoProject } = useExperience()

  if (!project) return <ModelUploader onSelect={createProject} onLoadDemo={loadDemoProject} />
  return <ProjectEditor />
}

export default function App() {
  return (
    <ExperienceProvider>
      <AppShell />
    </ExperienceProvider>
  )
}
