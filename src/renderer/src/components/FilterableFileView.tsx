import { useState } from 'react'
import SearchBox from './files_table/SearchBox'
import TableSwitcher from './files_table/TableSwitcher'
import RowTable from './files_table/RowTable'
import CardTable from './files_table/CardTable'
import PropTypes from 'prop-types';

function FilterableFileView({fileInfo}): React.JSX.Element {
  const [showRowTable, setShowRowTable] = useState(true)

  return (
    <div>
      <SearchBox />
      <TableSwitcher setRowTableView={setShowRowTable}/>
      {showRowTable ? <RowTable files={fileInfo} /> : <CardTable files={fileInfo} />}
    </div>
  )
}

FilterableFileView.propTypes = {
  fileInfo: PropTypes.array.isRequired
}

export default FilterableFileView
