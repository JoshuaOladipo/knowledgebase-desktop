import { useState } from 'react'
import SearchBox from './files_table/SearchBox'
import TableSwitcher from './files_table/TableSwitcher'
import RowTable from './files_table/RowTable'
import CardTable from './files_table/CardTable'

function FilterableFileView(): React.JSX.Element {
  const [showRowTable, setShowRowTable] = useState(true)

  return (
    <div>
      <SearchBox />
      <TableSwitcher />
      {showRowTable ? <RowTable /> : <CardTable />}
    </div>
  )
}

export default FilterableFileView
