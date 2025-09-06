export class FileDisplay {
  name: string
  displayImageUrl: string
  file?: File | null

  constructor(name: string, displayImageUrl: string, file: File | null) {
    this.name = name
    this.displayImageUrl = displayImageUrl
    this.file = file
  }
}
