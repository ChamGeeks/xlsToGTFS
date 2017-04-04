const fs = require('fs')
const xlsx = require('node-xlsx').default
const XLSX = require('xlsx')

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
 *
 * Stop_times.txt
 *
 * trip_id, arrival_time, departure_time, stop_id, stop_sequence,
 * stop_headsign, pickup_type, drop_off_time, shape_dist_traveled
 */
async function tripsTxt (stops) {
  const trips = []
  const stopTimes = []
  const timetablesDir = `${__dirname}/chamonix/timetables`;
  const timetableFiles = await readdirPromise(timetablesDir)

  for (const lineFile of timetableFiles) {
    const route_id = parseInt(lineFile, 10)
    const file = `${__dirname}/chamonix/timetables/${lineFile}`
    // const lineExcel = xlsx.parse(file)
    // const lineSheet = lineExcel[0].data

    const workSheet = XLSX.readFile(file)
    const sheet = workSheet.Sheets.Feuil1
    const lineSheet = XLSX.utils.sheet_to_json(sheet, {header: 1, raw: false})

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
      const [trip_headsign, stopName, service_id, ...times] = line

      // Save stop_imes

      const stop = stops.find((stop) => stop[1].trim() === stopName.trim())
      for (let i = 0; i < times.length; i++) {
        const time = times[i] && times[i].match(/[0-9]{2}:[0-9]{2}/) ? times[i] : ''

        stopTimes.push([
          trip_id,
          time, // arrival_time,
          time, // departure_time,
          stop[0], // stop_id,
          i, // stop_sequence,
          stopName, // stop_headsign,
          0, // pickup_type,
          0, //drop_off_time,
          '', // shape_dist_traveled,
          0 // timepoint
        ])
      }

      // Save trips

      if (savedTrips.includes(trip_id)) continue
      savedTrips.push(trip_id)

      trips.push([
        route_id,
        service_id,
        trip_id,
        trip_headsign,
        direction, // direction_id,
        '', // block_id,
        '' //shape_id
      ])
    }
  }

  console.log(trips)
  console.log('-----\n-----\n-----\n-----\n-----\n-----\n-----\n')
  console.log(stopTimes)
}

/**
 * Stops.txt
 *
 * stop_id, stop_name, stop_desc, stop_lat, stop_lon, zone_id, stop_url
 */
async function stopsTxt () {
  const stops = []
  const stopsDir = `${__dirname}/chamonix/busstops`;
  const stopsFiles = await readdirPromise(stopsDir)

  for (const lineFile of stopsFiles) {
    const file = `${__dirname}/chamonix/busstops/${lineFile}`
    const lineExcel = xlsx.parse(file)
    const lineSheet = lineExcel[0].data
    // Remove header
    lineSheet.shift()
    const rows = lineSheet.filter((row) => row.length)

    for (const row of rows) {
      const hasStop = stops.find((stop) => stop[1].trim() === row[1].trim())
      if (!hasStop) stops.push(row)
    }
  }

  // const stopNames = stops.map((stop) => stop[1]).sort()
  // console.log(stopNames)

  return stops.map((stop, index) => {
    const [ , stop_name, stop_lat, stop_lon ] = stop
    return [
      index, // stop_id
      stop_name,
      '', // stop_desc
      stop_lat,
      stop_lon,
      '', //zone_id,
      '' //stop_url
    ]
  })
}

/**
 * Helper function
 */

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

/**
 * Run the code!
 */

// Get routes.txt
// console.log(routesTxt())

// Get stops.txt WIP
stopsTxt()
  .then((stops) => {
    // Get trips.txt WIP
    tripsTxt(stops)
  })
