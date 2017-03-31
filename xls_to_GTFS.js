const fs = require('fs')
const xlsx = require('node-xlsx').default

// Période
// semaine = week
// soir = evening
// FS = ?
// Vacances = Holidays

/**
 * Routes.txt
 *
 * route_id, agency_id, route_short_name, route_long_name,
 * route_desc, route_type, route_url, route_color, route_text_color
 */
function routesTxt () {
  const agency_id = 1
  const routesExcel = xlsx.parse(`${__dirname}/chamonix/lines.xlsx`)
  const routeSheet = routesExcel[0].data

  // Remove header
  routeSheet.shift()

  const routes = routeSheet.filter((route) => route.length)

  return routes.map((route) => {
    const [ route_id, route_long_name, route_color ] = route
    return [
      route_id,
      agency_id,
      route_id, // route_short_name
      route_long_name,
      '', //route_desc,
      3,  // route_type
      '', // route_url
      route_color,
      '' // route_text_color
    ]
  })
}

/**
 * Trips.txt
 *
 * route_id, service_id, trip_id, trip_headsign, direction_id, block_id, shape_id
 */
async function tripsTxt () {
  const trips = []
  const timetablesDir = `${__dirname}/chamonix/timetables`;
  const timetableFiles = await readdirPromise(timetablesDir)

  for (const lineFile of timetableFiles) {
    const route_id = parseInt(lineFile, 10)
    const lineExcel = xlsx.parse(`${__dirname}/chamonix/timetables/${lineFile}`)
    const lineSheet = lineExcel[0].data

    // Remove header
    lineSheet.shift()

    const lines = lineSheet.filter((line, index, arr) => {
      const hasContentOnNextRow = (arr[index + 1] && arr[index + 1].length)
      const rowHasContent = line.length

      return (rowHasContent || hasContentOnNextRow)
    })
    let direction = 0
    const savedTrips = []

    // @TODO Handle Période (different or the same)
    for (const line of lines) {
      if (!line.length) {
        direction++
        continue
      }
      const trip_id = `${route_id}_${direction}`

      if (savedTrips.includes(trip_id)) continue
      savedTrips.push(trip_id)

      trips.push([
        route_id,
        line[2], // service_id,
        trip_id,
        line[0], // trip_headsign,
        direction, // direction_id,
        '', // block_id,
        '' //shape_id
      ])
    }
  }

  console.log(trips)
}

try {
  tripsTxt()
} catch (e) {
  console.error(e)
}

function readdirPromise (dir) {
  return new Promise((resolve, reject) => {
    fs.readdir(dir, (err, files) => {
      if (err) return reject(err)
      resolve(files)
    })
  })
}


function arrayEquals (a1, a2) {
  if (!a1 || !a2 || a1.length != a2.length) return false

  for (let i = 0; i < a1.length; i++) {
    if (a1[i] != a2[i]) return false
  }
  return true
}
