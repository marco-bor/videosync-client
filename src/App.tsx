import { Alert, AlertIcon } from '@chakra-ui/alert'
import { Avatar, AvatarGroup } from '@chakra-ui/avatar'
import { Button } from '@chakra-ui/button'
import { useClipboard } from '@chakra-ui/hooks'
import { Input } from '@chakra-ui/input'
import { Box, Container, Divider, Heading, HStack, VStack } from '@chakra-ui/layout'
import { useEffect, useState } from 'react'
import ReactPlayer from 'react-player'
import { v4 as uuid } from 'uuid'

import { JoinEvent, LeaveEvent, PauseEvent, PlayEvent, RoomStateEvent, SyncEvent, UpdateNameEvent } from './types'

// Load user id and room id
const userId: string = uuid()
const roomId: string = window.location.pathname.substr(1)

// Redirect to new room if at rooth path (/)
if (!roomId) {
  window.location.pathname = "/" + uuid()
}

let socket = new WebSocket(process.env.REACT_APP_WS_URL!)

socket.onopen = () => {
  const ev: JoinEvent = {
    type: "join",
    room: roomId,
    user: userId
  }
  socket.send(JSON.stringify(ev))
}

const leave = () => {
  const ev: LeaveEvent = {
    type: "leave",
    room: roomId,
    user: userId
  }
  socket.send(JSON.stringify(ev))
}

function App() {
  const [file, setFile] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [users, setUsers] = useState<string[]>([])
  const [error, setError] = useState("")
  const [playing, setPlaying] = useState(false)
  const [player, setPlayer] = useState<ReactPlayer | null>(null)
  const [state, setState] = useState<RoomStateEvent | null>(null)
  const [readyCount, setReadyCount] = useState(0)
  const [name, setName] = useState("")
  const { hasCopied, onCopy } = useClipboard(window.location.href)

  const pauseHandler = () => {
    // prevent emitting same event multiple times
    if (playing) {
      setPlaying(false)
      const ev: PauseEvent = {
        type: "pause",
        room: roomId,
        user: userId
      }
      socket.send(JSON.stringify(ev))
    }
  }

  const playHandler = () => {
    // prevent emitting same event multiple times
    if (!playing) {
      setPlaying(true)
      const ev: PlayEvent = {
        type: "play",
        timestamp: new Date().getTime(),
        seconds: player!.getCurrentTime() || progress,
        room: roomId,
        user: userId
      }
      socket.send(JSON.stringify(ev))
    }
  }

  const progressHandler = ({ playedSeconds }: {
    playedSeconds: number
  }) => {
    setProgress(playedSeconds)
  }

  useEffect(() => {
    // Listen socket events
    socket.onmessage = (ev) => {
      const msg: SyncEvent = JSON.parse(ev.data)

      // prevent listening to same-user event
      if (msg.user === userId) return

      switch (msg.type) {

        case 'pause':
          setPlaying(false)
          break

        case 'play':
          setPlaying(true)
          const seconds = adjustedSeconds(msg)
          console.log("player time", player!.getCurrentTime())
          console.log("seconds", seconds)
          if (Math.abs(seconds - (player?.getCurrentTime() || 0)) > 1) {
            player?.seekTo(seconds, "seconds")
            console.log("-> seek", seconds)
          }
          break

        case "stats":
          setUsers(msg.users)
          setState(msg)
          setPlaying(msg.playing)
          break
      }
    }
  }, [player])

  useEffect(() => {
    socket.onclose = (ev) => {
      console.log("socket closed", ev)
      setError("Invalid socket. Please refresh page.")
    }

    socket.onerror = (ev) => {
      console.log("socket error", ev)
      setError("Invalid socket. Please refresh page.")
    }

    return () => {
      if (socket.readyState === socket.OPEN) {
        leave()
        setError("You left the room. Refresh to join again.")
      }
    }
  }, [])

  const readyHandler = () => {
    if (readyCount === 0 && state) {
      player!.seekTo(adjustedSeconds(state))
      setReadyCount(readyCount + 1)
    }
  }

  const nameHandler = () => {
    const ev: UpdateNameEvent = { type: 'update_name', name: name, user: userId }
    socket.send(JSON.stringify(ev))
  }

  return (<>
    <Container >
      <Box mt="20">
        <VStack spacing="4" align="start">
          {error && <Alert status="error"><AlertIcon />{error}</Alert>}
          <Heading as="span" size="sm">Source</Heading>
          <ReactPlayer
            url={file || ""}
            ref={(ref) => { setPlayer(ref) }}
            controls
            width="100%"
            height=""
            playing={playing}
            onPlay={playHandler}
            onReady={readyHandler}
            onPause={pauseHandler}
            onProgress={progressHandler}
          />

          {!file && <div>
            <input type="file" onChange={e => setFile(URL.createObjectURL(e.target.files![0]))} />
          </div>
          }
          <Divider />

          <Heading size="sm">Online <Button onClick={onCopy} ml={2}>
            {hasCopied ? "Copied" : "Copy URL"}
          </Button></Heading>
          <AvatarGroup size="sm" max={3}>
            {users.map(it => <Avatar name={it} />)}
          </AvatarGroup>

          <Divider />

          <Heading size="sm">Name</Heading>
          <HStack spacing={3}>
            <Input placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
            <Button onClick={nameHandler}>OK</Button>
          </HStack>
        </VStack>
      </Box>
    </Container>
  </>
  )
}

export default App

window.onbeforeunload = leave

function adjustedSeconds(msg: RoomStateEvent | PlayEvent): number {
  const delay = msg.timestamp ? (new Date().getTime() - msg.timestamp) / 1000 : 0
  console.log("delay", delay)
  return msg.seconds + delay
}