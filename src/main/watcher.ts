import chokidar from 'chokidar'

async function watchFolders(event, folders: string[]): Promise<string> 
{
  // Set up watcher
  const watcher = chokidar.watch(folders, {
    persistent: true,
    ignoreInitial: false,
    depth: 99
  })

  console.log('watch on', folders[0])
  watcher
    .on('add', path => {
      console.log(`File added: ${path}`)
      // Optionally: send event to renderer
    })
    .on('change', path => {
      console.log(`File changed: ${path}`)
    })
    .on('unlink', path => {
      console.log(`File removed: ${path}`)
    })
    .on('error', error => {
      console.error('Watcher error:', error)
    })

  return 'watching'
}

export default watchFolders