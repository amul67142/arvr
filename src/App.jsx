import EmbedApp from './components/embed/EmbedApp'
import FollowLab from './components/tracer/FollowLab'
import HotspotTracer from './components/tracer/HotspotTracer'
import ProjectEditor from './components/editor/ProjectEditor'
import ModelUploader from './components/upload/ModelUploader'
import { readEmbedConfig } from './experience/embed'
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

// Read once, at load: ?embed=<project> turns the whole app into the tour a
// customer's website frames. It cannot change without a reload.
const embed = readEmbedConfig()

// ?trace=<manifest> opens the hotspot tracer instead — an internal tool for
// drawing or correcting a project's clickable polygons by hand.
const tracing = new URLSearchParams(window.location.search).get('trace')

// ?follow=<manifest> opens the Option A lab: outlines drawn on a few frames of
// an orbit video, carried round the rest from the footage alone.
const following = new URLSearchParams(window.location.search).get('follow')

export default function App() {
  if (following) return <FollowLab manifestUrl={following} />
  if (tracing) return <HotspotTracer manifestUrl={tracing} />

  if (embed) {
    return (
      <ExperienceProvider embed={embed}>
        <EmbedApp config={embed} />
      </ExperienceProvider>
    )
  }

  return (
    <ExperienceProvider>
      <AppShell />
    </ExperienceProvider>
  )
}
