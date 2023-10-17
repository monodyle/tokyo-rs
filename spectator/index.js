const BASE_SHIP_SIZE = 10
var websocket_status = document.getElementById('websocket-status')
var chart = document.getElementById('scoreboard')
var feed = document.getElementById('killfeed')
var feed_anchor = document.getElementById('anchor')
var c = document.getElementById('canvas')
window.onload = window.onresize = function () {
  const container = document.getElementById('playground')
  const client_width = container.clientWidth
  const client_height = container.clientHeight
  const [max_w, max_h] = [client_width, client_width / 1.4]
  const [min_w, min_h] = [client_height * 1.4, client_height]

  if (client_width > min_w && client_height > min_h) {
    c.width = max_w
    c.height = max_h
  } else {
    c.width = min_w
    c.height = min_h
  }
}
var team_names = {}
let prev_scoreboard = {}
let prev_dead = []
let died = []

var ctx = c.getContext('2d')

function connect (handler) {
  websocket_status.innerText = 'connecting...'
  websocket_status.style.borderColor = 'gray'
  const isLocalServer = window.location.host.indexOf('localhost') !== -1
  // const protocol = isLocalServer ? 'ws://' : 'wss://';
  const socket = new WebSocket(`wss://combat.sege.dev/spectate`)
  socket.addEventListener('open', function (event) {
    websocket_status.innerText = 'connected'
    websocket_status.style.borderColor = 'white'
  })

  socket.addEventListener('close', function (event) {
    websocket_status.innerText = 'disconnected'
    websocket_status.style.borderColor = 'orange'
    setTimeout(function () {
      connect(handler)
    }, 1000)
  })

  socket.addEventListener('error', function (event) {
    websocket_status.innerText = 'error!'
    websocket_status.style.borderColor = 'red'
    socket.close()
  })

  socket.addEventListener('message', function (event) {
    let json = JSON.parse(event.data)
    handler(json)
  })
}

class Item {
  constructor (obj) {
    this.x = obj.x
    this.y = obj.y
    this.radius = obj.radius
    this.item_type = obj.item_type
  }

  draw (ctx) {
    ctx.save()
    ctx.translate(this.x, this.y)

    let oldFill = ctx.fillStyle
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI)
    switch (this.item_type) {
      case 'BiggerBullet':
        ctx.fillStyle = '#ff8d5c'
        break
      case 'FasterBullet':
        ctx.fillStyle = '#74b9ff'
        break
      case 'MoreBullet':
        ctx.fillStyle = '#d5ff05'
        break
    }
    ctx.fill()
    ctx.fillStyle = oldFill

    ctx.restore()
  }
}

class Ship {
  constructor (obj) {
    this.id = obj.id
    this.x = Math.floor(obj.x)
    this.y = Math.floor(obj.y)
    this.angle = obj.angle
    this.radius = obj.radius
  }

  move (x, y) {
    this.x = x
    this.y = y
  }

  rotate (theta) {
    this.angle = theta
  }

  draw (ctx) {
    ctx.save()
    // orient the ship
    ctx.translate(this.x, this.y)
    ctx.rotate(this.angle - Math.PI / 2.0)

    const shipSize = this.radius + BASE_SHIP_SIZE

    let oldFill = ctx.fillStyle
    // draw the ship triangle
    ctx.beginPath()
    ctx.lineWidth = 2
    ctx.moveTo(-shipSize * 0.8, -shipSize)
    ctx.lineTo(0, shipSize)
    ctx.lineTo(shipSize * 0.8, -shipSize)
    ctx.lineTo(-shipSize * 0.8, -shipSize)
    ctx.fillStyle = '#ff0000'
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = oldFill

    // draw team name
    ctx.rotate(-this.angle + Math.PI / 2.0) // please don't ask me about this math
    oldFill = ctx.fillStyle
    ctx.font = '32px monospace'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    let textMeasurements = ctx.measureText(team_names[this.id])
    ctx.fillStyle = '#000000'
    ctx.fillRect(17, -3, textMeasurements.width + 6, 15)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(team_names[this.id], 20, 0)
    ctx.fillStyle = oldFill

    // reset transformation
    ctx.restore()
  }
}

class Bullet {
  constructor (obj) {
    this.id = obj.id
    this.player_id = obj.player_id
    this.x = obj.x
    this.y = obj.y
    this.angle = obj.angle
    this.radius = obj.radius
  }

  move (x, y) {
    this.x = x
    this.y = y
  }

  rotate (theta) {
    this.theta = theta
  }

  draw (ctx) {
    ctx.save()
    ctx.translate(this.x, this.y)

    let oldFill = ctx.fillStyle
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI)
    ctx.fillStyle = '#f9ca24'
    ctx.fill()
    ctx.fillStyle = oldFill

    ctx.restore()
  }
}

let last_drawn_scoreboard = {}
let initCanvas = false
connect(function (json) {
  if (json.e === 'teamnames') {
    team_names = json.data
  } else if (json.e === 'state') {
    const data = json.data

    if (JSON.stringify(prev_scoreboard) === '{}') {
      prev_scoreboard = data.scoreboard
    }

    ctx.save()
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1
    ctx.lineCap = 'square'
    ctx.lineJoin = 'bevel'

    scaleXRatio = c.width / data.bounds[0]
    scaleYRatio = c.height / data.bounds[1]
    scaleRatio = Math.min(scaleXRatio, scaleYRatio)
    ctx.transform(scaleRatio, 0, 0, scaleRatio, 0, 0)

    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(data.bounds[0], 0)
    ctx.lineTo(data.bounds[0], data.bounds[1])
    ctx.lineTo(0, data.bounds[1])
    ctx.lineTo(0, 0)
    ctx.stroke()

    for (const player of data.players) {
      new Ship(player).draw(ctx)
    }

    for (const bullet of data.bullets) {
      new Bullet(bullet).draw(ctx)
    }

    for (const item of data.items) {
      new Item(item).draw(ctx)
    }

    ctx.restore()

    if (JSON.stringify(prev_dead) !== JSON.stringify(data.dead)) {
      for (const prev_dead_player of prev_dead) {
        const index = died_on_feed.findIndex(
          player_id => player_id === prev_dead_player.player.id
        )
        if (index != -1) {
          died_on_feed.splice(index, 1)
          update_killfeed(
            `${team_names[dead.player.id]} (${dead.player.id}) respawned`
          )
        }
      }
      prev_dead = data.dead
    }

    if (
      JSON.stringify(data.scoreboard) !== JSON.stringify(last_drawn_scoreboard)
    ) {
      draw_scoreboard(data.scoreboard)
      draw_killfeed(data.dead, data.scoreboard)
      last_drawn_scoreboard = data.scoreboard
    }
  }
})

function sanitizeHTML (text) {
  var element = document.createElement('div')
  element.innerText = text
  return element.innerHTML
}

function draw_scoreboard (scoreboard) {
  var sorted_players = Object.keys(scoreboard).sort(function (a, b) {
    return scoreboard[b] - scoreboard[a]
  })
  var tableHtml = '<tbody>'

  tableHtml += `<tr>
        <td colspan="3" class="heading"><b>Information</b></td>
      </tr>`
  tableHtml += `<tr>
        <td colspan="3">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 5px; background: #ff8d5c;"></span>
          Bigger Bullet
        </td>
      </tr>`
  tableHtml += `<tr>
        <td colspan="3">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 5px; background: #74b9ff;"></span>
          Faster Bullet
        </td>
      </tr>`
  tableHtml += `<tr>
        <td colspan="3">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 5px; background: #d5ff05;"></span>
          More Bullet
        </td>
      </tr>`
  tableHtml += `<tr style="padding-top: 20px;">
        <td colspan="3" class="heading"><b>Leaderboard</b></td>
      </tr>`
  for (let i = 0; i < sorted_players.length; i++) {
    const player_id = sorted_players[i]
    const player_score = String(scoreboard[player_id]).padEnd(3)
    const team_name = sanitizeHTML(team_names[player_id])

    tableHtml += `
            <tr class="rank-${i + 1}">
              <td class="rank">${i + 1}</td>
              <td class="name">${team_name}</td>
              <td class="score">${player_score}</td>
            </tr>`
  }
  chart.innerHTML = tableHtml + '</tbody>'
}

function update_killfeed (text) {
  const item = document.createElement('div')
  item.innerText = text
  feed.insertBefore(item, feed_anchor)
}

const died_on_feed = []
function draw_killfeed (dead, scoreboard) {
  if (dead.length) {
    for (const { player: dead_player } of dead) {
      if (died_on_feed.includes(dead_player.id)) {
        continue
      } else {
        dead_player.push(dead_player.id)
        update_killfeed(`${team_names[dead_player.id]} died`)
        // console.log('new dead player', dead_player.id, team_names[dead_player.id])
        // already_dead.push(dead_player.id)
        // for (const [killer_id, score] of Object.entries(scoreboard)) {
        //   const prev_score = prev_scoreboard[killer_id]
        //   if (killer_id === dead_player.id.toString()) {
        //     continue
        //   }
        //   if (score > prev_score) {
        //     console.log(team_names[killer_id], score, prev_score)
        //     prev_scoreboard = scoreboard
        //     const item = document.createElement('div')
        //     console.log(`${team_names[killer_id]} (${killer_id}) killed ${team_names[dead_player.id]} (${dead_player.id})`)
        //     item.innerText = `${team_names[killer_id]} killed ${team_names[dead_player.id]}`
        //     feed.prepend(item)
        //     break
        //   }
        // }
      }
    }
  } else {
    console.log('reset')
    died_on_feed = []
  }
  prev_scoreboard = scoreboard
}

const observer = new MutationObserver(function (mutationsList, observer) {
  for (let mutation of mutationsList) {
    if (mutation.type === 'childList') {
      window.scrollTo(0, document.body.scrollHeight)
    }
  }
})
observer.observe(feed, { childList: true })
