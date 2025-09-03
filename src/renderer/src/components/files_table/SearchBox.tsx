import { useState } from 'react'

function SearchBox(): React.JSX.Element {
  return (
    <div className="flex justify-center items-center gap-2 my-4">
      <input type="text" placeholder="Search…" className="input input-bordered w-full max-w-xs" />
      <button className="btn btn-primary">Search</button>
    </div>
  )
}

export default SearchBox
