export class File {
  path: string
  name: string
  size: number
  permissions: string
  owner: string
  group: string
  createdAt: Date
  modifiedAt: Date
  isDirectory: boolean

  constructor(params: {
    path: string
    name: string
    size: number
    permissions: string
    owner: string
    group: string
    createdAt: Date
    modifiedAt: Date
    isDirectory: boolean
  }) {
    this.path = params.path
    this.name = params.name
    this.size = params.size
    this.permissions = params.permissions
    this.owner = params.owner
    this.group = params.group
    this.createdAt = params.createdAt
    this.modifiedAt = params.modifiedAt
    this.isDirectory = params.isDirectory
  }
}
