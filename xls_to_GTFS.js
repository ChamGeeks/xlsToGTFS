const fs = require('fs')
const xlsx = require('node-xlsx').default
const XLSX = require('xlsx')
const sqlite = require('sqlite')
const leftPad = require('left-pad') // Why not ;)

// @TODO
// 1. Fix trip and stop_times (They are saved wrong)
// Stop times are now saved by as many stops there is which is wrong


/**
 * Run the code!
 */

async function main() {

  // Get data
  const routes = routesTxt()
  const stops = await stopsTxt()
  const tripsAndStops = await tripsAndStopTimesTxt(stops)

  // Save data
  const db = await sqlite.open('./GTFS.sqlite')
  await saveRoutesToDb(db, routes)
  await saveStopsToDb(db, stops)
  await saveTripsToDb(db, tripsAndStops.trips)
  await saveStopTimesToDb(db, tripsAndStops.stopTimes)

  // Fin!
  console.log('Done')
}
main()


async function saveRoutesToDb (db, routes) {
  const drop = await db.run('DROP TABLE IF EXISTS routes')

  const create = await db.run(`CREATE TABLE routes(
    route_id TEXT, agency_id TEXT, route_short_name TEXT,
    route_long_name TEXT, route_desc TEXT, route_type NUMERIC,
    route_url TEXT, route_color TEXT, route_text_color TEXT
  )`)

  routes.forEach(async (route) => {
    const insert = await db.run(`INSERT INTO routes
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, route)
  })
}

async function saveStopsToDb (db, stops) {
  const drop = await db.run('DROP TABLE IF EXISTS stops')

  const create = await db.run(`CREATE TABLE stops(
    stop_id TEXT, stop_name TEXT,
    stop_desc TEXT, stop_lat REAL, stop_lon REAL,
    zone_id NUMERIC, stop_url TEXT
  )`)

  await db.run(`CREATE INDEX stop_id_stops ON stops (stop_id)`)

  stops.forEach(async (stop) => {
    const insert = await db.run(`INSERT INTO stops
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, stop)
  })
}

async function saveTripsToDb (db, trips) {
  await db.run('DROP TABLE IF EXISTS trips')

  await db.run(`CREATE TABLE trips(
    route_id TEXT, service_id TEXT, trip_id TEXT,
    trip_headsign TEXT, direction_id NUMERIC,
    block_id TEXT, shape_id TEXT
  )`)

  await db.run(`CREATE INDEX route_id_trips ON trips (route_id)`)
  await db.run(`CREATE INDEX trip_id_trips ON trips (trip_id)`)

  trips.forEach(async (trip) => {
    const insert = await db.run(`INSERT INTO trips
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, trip)
  })
}

async function saveStopTimesToDb (db, trips) {
  const drop = await db.run('DROP TABLE IF EXISTS stop_times')

  const create = await db.run(`CREATE TABLE stop_times(
    trip_id TEXT, arrival_time TEXT, departure_time TEXT,
    stop_id TEXT, stop_sequence NUMERIC, stop_headsign TEXT,
    pickup_type NUMERIC, drop_off_type NUMERIC, shape_dist_traveled TEXT,
    timepoint NUMERIC
  )`)

  await db.run(`CREATE INDEX stop_id_stop_times ON stop_times (stop_id)`)
  await db.run(`CREATE INDEX trip_id_stop_times ON stop_times (trip_id)`)
  await db.run(`CREATE INDEX stop_sequence_stop_times ON stop_times (stop_sequence)`)

  const inserted = []
  trips.forEach(async (trip) => {
    inserted.push(db.run(`INSERT INTO stop_times
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, trip))
  })
  return Promise.all(inserted)
}

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
 * stop_headsign, pickup_type, drop_off_time, shape_dist_traveled, timepoint
 */
async function tripsAndStopTimesTxt (stops) {
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
    const lineSheet = XLSX.utils.sheet_to_json(sheet, {header: 1, raw: true})

    // Remove header
    lineSheet.shift()

    /**
     * Group directions
     */
    const tripGroups = {}
    for (const line of lineSheet) {
      if (!line.length) continue
      const [headsign, /*stopName*/, service_id] = line
      const tripIdName = `${headsign.toLowerCase().trim()}__${service_id.toLowerCase().trim()}`
      if (!tripGroups[tripIdName]) tripGroups[tripIdName] = []
      tripGroups[tripIdName].push(line)
    }

    /**
     * Save trips
     */
    let directionId = 0
    for (const tripGroup of Object.values(tripGroups)) {
      directionId++
      const tripIds = []
      const [trip_headsign, /*stopName*/, service_id, ...tripTimes] = tripGroup[0]

      for (let i = 0; i < tripTimes.length; i++) {
        const trip_id = `${route_id}_${directionId}_${leftPad(i, 3, 0)}`

        tripIds.push(trip_id)
        trips.push([
          route_id,
          service_id, // service_id
          trip_id,
          trip_headsign,
          directionId, // direction_id,
          '', // block_id,
          '' //shape_id
        ])
      }

      /**
       * Save stop times
       */
      // A stops all times
      for (const row of tripGroup) {
        const [/*trip_headsign*/, stopName, /*service_id*/, ...times] = row
        const stop = stops.find((stop) => stop[1].trim() === stopName.trim())

        let stop_sequence = 0
        for (let i = 0; i < times.length; i++) {
          let time = ''
          if (!isNaN(times[i])) {
            time = XLSX.SSF.parse_date_code(times[i])
            time = `${leftPad(time.H, 2, 0)}:${leftPad(time.M, 2, 0)}`
            stop_sequence++
          }
          stopTimes.push([
            tripIds[i],
            time, // arrival_time,
            time, // departure_time,
            stop[0], // stop_id,
            stop_sequence, // stop_sequence,
            stopName, // stop_headsign,
            0, // pickup_type,
            0, //drop_off_time,
            '', // shape_dist_traveled,
            0 // timepoint
          ])
        }
      }
    }
  }

  return {
    trips,
    stopTimes
  }
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


// create table agency(agency_id TEXT,agency_name TEXT,agency_url TEXT,
//                     agency_timezone TEXT,agency_lang TEXT, agency_phone TEXT);
// create table calendar_dates(service_id TEXT,date NUMERIC,exception_type NUMERIC);
// create table routes(route_id TEXT,agency_id TEXT,route_short_name TEXT,
//                     route_long_name TEXT,route_desc TEXT,route_type NUMERIC,
//                     route_url TEXT,route_color TEXT,route_text_color TEXT);
// create table shapes(shape_id TEXT,shape_pt_lat REAL,shape_pt_lon REAL,
//                     shape_pt_sequence NUMERIC);
// create table stops(stop_id TEXT,stop_code TEXT,stop_name TEXT,
//                    stop_desc TEXT,stop_lat REAL,stop_lon REAL,
//                    zone_id NUMERIC,stop_url TEXT,timepoint NUMERIC);
// create table stop_times(trip_id TEXT,arrival_time TEXT,departure_time TEXT,
//                         stop_id TEXT,stop_sequence NUMERIC,stop_headsign TEXT,
//                         pickup_type NUMERIC,drop_off_type NUMERIC);
// create table trips(route_id TEXT,service_id TEXT,trip_id TEXT,
//                    trip_headsign TEXT,direction_id NUMERIC,
//                    block_id TEXT,shape_id TEXT);
