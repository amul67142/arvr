import { useCallback, useState } from 'react'

import ErrorState from './components/common/ErrorState'
import ModelUploader from './components/upload/ModelUploader'
import ProjectViewer from './components/viewer/ProjectViewer'
import { useUploadedModel } from './hooks/useUploadedModel'
import { ViewerProvider } from './state/ViewerProvider'

/**
 * Upload -> Loading -> Viewer, with no navigation and no page reload.
 * The selected file lives only in React state and as a blob URL.
 */
export default function App() {
  const { source, open, close } = useUploadedModel()
  const [failedName, setFailedName] = useState(null)

  const handleSelect = useCallback(
    (file, companions) => {
      setFailedName(null)
      open(file, companions)
    },
    [open],
  )

  const handleExit = useCallback(() => {
    setFailedName(null)
    close()
  }, [close])

  const handleError = useCallback(() => {
    setFailedName(source?.name ?? null)
  }, [source])

  if (failedName) {
    return <ErrorState fileName={failedName} onRetry={handleExit} />
  }

  if (!source) {
    return <ModelUploader onSelect={handleSelect} />
  }

  return (
    // Remounting on every upload guarantees a clean viewer: no stale selection,
    // camera pose, inspector state or GPU resources carried between models.
    <ViewerProvider key={source.id}>
      <ProjectViewer
        key={source.id}
        source={source}
        onExit={handleExit}
        onError={handleError}
      />
    </ViewerProvider>
  )
}
