import React from 'react'
import FilterableFileView from './components/FilterableFileView'

// Dummy data for card grid
const items = Array.from({ length: 18 }, (_, i) => ({
  id: i + 1,
  title: `Card Title ${i + 1}`,
  datetime: new Date(Date.now() - i * 3600_000).toLocaleString(),
  image: `https://picsum.photos/seed/${i + 1}/300/200`
}))

function App(): React.JSX.Element {
  return (
    <>
      <FilterableFileView />
    </>
  )
}

export default App
