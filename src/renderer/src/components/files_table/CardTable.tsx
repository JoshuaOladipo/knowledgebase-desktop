import PropTypes from 'prop-types'

function CardTable({ files }): React.JSX.Element {
  return (
    <>
      {/* DaisyUI Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 my-8">
        {files.map((item) => (
          <div key={item.name} className="card bg-base-100 shadow-xl">
            <figure>
              <img
                src={item.displayImageUrl}
                alt={item.name}
                className="w-full h-48 object-cover"
              />
            </figure>
            <div className="card-body">
              <h2 className="card-title">{item.name}</h2>
              <p className="text-sm text-gray-500">{item.name}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

CardTable.propTypes = {
  files: PropTypes.arrayOf(PropTypes.object).isRequired
}

export default CardTable
