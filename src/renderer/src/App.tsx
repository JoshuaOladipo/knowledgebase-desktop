import React from 'react'
import FilterableFileView from './components/FilterableFileView'
import electronLogo from './assets/electron.svg'
import { FileDisplay } from './models/FileDisplay'

// Dummy data for card grid
const files: FileDisplay[] = [new FileDisplay('Card Title 1', electronLogo, null),
  new FileDisplay('Card Title 2', electronLogo, null),
  new FileDisplay('Card Title 3', electronLogo, null),
  new FileDisplay('Card Title 4', electronLogo, null)
]

function App(): React.JSX.Element {
  return (
    <>
      <FilterableFileView fileInfo={files}/>
    </>
  )
}

export default App
