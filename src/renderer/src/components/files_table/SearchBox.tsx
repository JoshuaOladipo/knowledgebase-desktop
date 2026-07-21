import { useFiles } from './useFiles'

/** Renders the controlled search input used to filter file names and paths. */
function SearchBox(): React.JSX.Element {
  const { query, setQuery } = useFiles()
  return (
    <label className="input input-bordered flex items-center gap-2">
      <span className="sr-only">Search files</span>
      <input
        className="grow"
        type="search"
        placeholder="Search files…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
    </label>
  )
}

export default SearchBox
