import { useState } from 'react'

function CardTable(): React.JSX.Element {
  return (
    <>
      {/* DaisyUI Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 my-8">
        {paginatedItems.map((item) => (
          <div key={item.id} className="card bg-base-100 shadow-xl">
            <figure>
              <img src={item.image} alt={item.title} className="w-full h-48 object-cover" />
            </figure>
            <div className="card-body">
              <h2 className="card-title">{item.title}</h2>
              <p className="text-sm text-gray-500">{item.datetime}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination Controls */}
      <div className="flex justify-center items-center gap-2 mb-8">
        <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <span className="mx-2">
          Page {page} of {pageCount}
        </span>
        <button
          className="btn btn-outline"
          disabled={page === pageCount || pageCount === 0}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  )
}

export default CardTable
