import React from 'react'
import FilterableFileView from './components/FilterableFileView'
import { FilesProvider } from './components/files_table/FileContext'
import electronLogo from './assets/electron.svg'
import { FileDisplay } from './models/FileDisplay'

// Dummy data for card grid
const files: FileDisplay[] = [new FileDisplay('Card Title 1', electronLogo, null),
  new FileDisplay('Card Title 2', electronLogo, null),
  new FileDisplay('Card Title 3', electronLogo, null),
  new FileDisplay('Card Title 4', electronLogo, null)
]

const watched_folders: string[] = ['/home/joshua/Downloads']
const managed_folder:string = ''

function App(): React.JSX.Element {
  React.useEffect(() => {
    if (watched_folders.length > 0) {
      window.api.watchFolders(watched_folders)
    }
  }, [])

  return (
    <FilesProvider files={files}>
      <FilterableFileView />
    </FilesProvider>
  )
}

export default App
