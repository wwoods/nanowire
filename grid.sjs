
require seriousjs as sjs

class Grid uses sjs.EventMixin
  """Nanowire inspired Cellular Automata (CA) grid, either 2d or 3d."""

  STATE_EMPTY: 0
  STATE_SEED: 1
  STATE_NANO: 2
  STATE_DEAD: 3

  METHOD: new sjs.Enum(
      "FILL"
      "METHOD_ONE"
      "METHOD_TWO"
      "METHOD_THREE"
      DEFAULT: "METHOD_TWO"

  constructor: (@size = 10, @sizeZ = @size) ->
    """@size is the number of cells in the X and Y dimensions, @sizeZ is the
    number of cells in the Z dimension (use 1 for 2D).
    """
    @states = []
    @step = 0
    @method = Grid.METHOD.DEFAULT

    @inputs = []
    @outputs = []
    @hidden = []


  connect: ->
    """Uses Dijkstra's algorithm to fully connect seed points using established
    nanowires.

    Returns {
        members: Matches @states, 1 if member of shortest path, otherwise 0.
        matrix: [seeds] x [seeds] x [path] matrix of shortest paths.  Seed index
          used is index in states array.
        wireUsePct: [0, 1] percent of wires used in shortest paths connecting
          any two nodes.
        avgConnectivity: Number of other nodes each node is connected to, on
          average.
        avgLength: Average number of hops required to get between any two nodes
        wireFill: [0, 1] percent of space populated by nanowires
    """

    # seed index : true
    seeds = {}
    # For each block, a dict of { seed : shortest path to block }
    shortest = []
    # List of paths that haven't been catalogued yet, sorted by priority.
    trials = []

    wireFillPct = 0.0

    # Prioritized insertion for Dijkstra's, so that we achieve shortest paths
    insert = (path) ->
      src = path[0]
      dest = path[-1:][0]

      lo = 0
      hi = trials.length
      while lo < hi
        mid = (lo + hi) >> 1
        # Sort on dist, not length, because it's prettier
        if trials[mid].dist > path.dist
          hi = mid
        else
          lo = mid + 1
      trials.splice(lo, 0, path)

    for s, i in @states
      shortest.push {}
      if s == Grid.STATE_SEED
        seeds[i] = true
        thisPath = [ i ]
        thisPath.dist = 0
        insert thisPath
      elif s != Grid.STATE_EMPTY
        # Nanowire!
        wireFillPct += 1
    wireFillPct /= @states.length

    UNIDIRECTIONAL = 1

    while (n = trials.shift())?
      src = n[0]
      dest = n[-1:][0]
      # If this cell is set, then that is the shortest path since we're sorting
      # our insertions.
      if src of shortest[dest]
        continue

      shortest[dest][src] = n

      # Generate new paths
      if @states[dest] != Grid.STATE_SEED or src == dest
        {x, y, z} = @_split(dest)
        for nz in [-1:2]
          oz = z + nz
          if oz < 0 or oz >= @sizeZ
            continue

          for ny in [-1:2]
            oy = y + ny
            if oy < 0 or oy >= @size
              continue

            # NOTE - For feed-forward network, we assume connectivity only heads
            # one direction.
            for nx in [UNIDIRECTIONAL then 1 else -1:2]
              ox = x + nx
              if ox < 0 or ox >= @size
                continue

              if nx == 0 and ny == 0 and nz == 0
                continue

              oi = ox + @size * (oy + @size * oz)
              if @states[oi] != Grid.STATE_EMPTY
                nNew = n[:]
                nNew.push oi
                # If we don't use a distance, but use length, it still works 100%.
                # But, it's a LOT less pretty (and less intuitive).
                nNew.dist = n.dist + Math.sqrt(nx * nx + ny * ny + nz * nz)
                insert nNew

    members = []
    shortestBySeed = {}
    for s in @states
      members.push(0)
    for s of seeds
      shortestBySeed[s] = {}
    for s of seeds
      for s2 of seeds
        if s > s2 and not UNIDIRECTIONAL
          # To avoid confusing images and to get a better usage count,
          # make sure shortest paths are symmetrical (s -> s2 == s2 -> s)
          continue
        path = shortest[s2][s]
        if path?
          shortestBySeed[s][s2] = path
          UNIDIRECTIONAL or (shortestBySeed[s2][s] = path)
          for m in path
            members[m] = 1
        else
          shortestBySeed[s][s2] = null
          UNIDIRECTIONAL or (shortestBySeed[s2][s] = null)

    connected = 0
    connLength = 0
    total = 0
    for s, columns of shortestBySeed
      total += 1
      for s2, path of columns
        if s == s2
          continue
        if path?
          connected += 1
          # First member is origin, don't count that in length
          connLength += path.length - 1
    avgConnectivity = connected / total
    avgLength = connected then connLength / connected else 0.0

    usedWire = 0
    totalWire = 0
    for s, i in @states
      if s != Grid.STATE_EMPTY and s != Grid.STATE_SEED
        totalWire += 1
        if members[i]
          usedWire += 1
    wireUsePct = usedWire / totalWire

    return { members, matrix: shortestBySeed, wireUsePct, avgConnectivity,
        avgLength, wireFillPct }


  getSpecialCells: () ->
    """Returns list of positions containing special cells."""
    r = []
    r.push.apply(r, @inputs)
    r.push.apply(r, @outputs)
    r.push.apply(r, @hidden)
    return r


  matchCell: (si) ->
    """Returns the cell name for si, or (wire) or (empty) for a cell that is
    not input nor output."""
    for i, ii in @inputs
      if i == si
        return @nameInput(ii)
    for i, ii in @hidden
      if i == si
        return @nameHidden(ii)
    for i, ii in @outputs
      if i == si
        return @nameOutput(ii)
    if @states[si] == Grid.STATE_EMPTY
      return "(empty)"
    return "(wire)"


  nameInput: (i) ->
    """Returns the name for input #i. """
    return "i#{ i + 1 }"


  nameHidden: (i) ->
    """Returns the name for hidden #i. """
    return "h#{ i + 1 }"


  nameOutput: (i) ->
    """Returns the name for output #i. """
    return "o#{ i + 1 }"


  reset: (nodeCounts, newSize, newSizeZ) ->
    """Initialize an otherwise empty grid of size newSize x newSize x newSizeZ,
    with nodeCounts (colon delimited) seeds.
    """
    if newSize?
      @size = newSize
      if newSizeZ?
        @sizeZ = newSizeZ
      else
        @sizeZ = @size

      @event.trigger "resize"

    @states = []
    for z in [:@sizeZ]
      for y in [:@size]
        for x in [:@size]
          @states.push(Grid.STATE_EMPTY)

    counts = nodeCounts.split(':')
    if counts.length != 3
      throw new Error("#{ nodeCounts } is not formatted like 1:2:3")

    @inputs = []
    @outputs = []
    @hidden = []
    for c, i in counts
      for j in [:parseInt(c)]
        MAX_TRIES = 100
        for _try in [:MAX_TRIES]
          # Figure out column
          if i == 0
            x = 0
            y = Math.floor((0.5 + j) * Math.floor(@size / c))
            z = Math.floor(@sizeZ * 0.5)
          elif i == 2
            x = @size - 1
            y = Math.floor((0.5 + j) * Math.floor(@size / c))
            z = Math.floor(@sizeZ * 0.5)
          else
            x = Math.floor(Math.random() * (@size - 8)) + 4
            y = Math.floor(Math.random() * @size)
            z = Math.floor(Math.random() * @sizeZ)
          si = x + @size * (y + @size * z)
          if @states[si] == Grid.STATE_EMPTY
            @states[si] = Grid.STATE_SEED
            if i == 0
              @inputs.push si
            elif i == 2
              @outputs.push si
            else
              @hidden.push si
            break

        if _try == MAX_TRIES
          throw new Error("Bad node counts: #{ nodeCounts }")

    @step = 0
    @event.trigger "updatePost", -1


  update: ->
    """Triggers an update cycle.  Returns number of possible updates (fewer may
    actually happen due to stochasticity)."""
    i = 0
    possibleChanges = 0
    nstates = []
    for z in [:@sizeZ]
      for y in [:@size]
        for x in [:@size]
          curState = @states[i]
          r = @_updateCell(curState, x, y, z)
          if r?
            if r[1]
              possibleChanges += 1
            nstates.push(r[0])
          else
            nstates.push(curState)
          i += 1

    @states = nstates
    @step += 1
    @event.trigger "updatePost", possibleChanges
    return possibleChanges


  updateFinish: ->
    """Run update() until we have no more possible changes."""
    @event.suppress "updatePost"
    while 0 != @update()
      true
    @event.unsuppress "updatePost"
    @event.trigger "updatePost", 0


  _isBorder: (x, y, z) ->
    """Returns true if x, y, z is on border."""
    if x == 0 or y == 0
        or x == @size - 1 or y == @size - 1
      return true
    if @sizeZ != 1 and (z == 0 or z == @sizeZ - 1)
      return true
    return false


  _split: (i) ->
    """Splits a block index i into {x, y, z}"""
    result = {}
    result.z = Math.floor(i / (@size * @size))
    result.y = Math.floor(i / @size) % @size
    result.x = (i % @size)
    return result


  _updateCell: (curState, x, y, z) ->
    """Performs our current update METHOD to cell at x, y, z.  Returns
    [ nextState, couldChange ].  May return null for no change, no possible
    change.
    """
    canChange = false
    nextState = curState

    if @method == @METHOD.FILL
      if curState != Grid.STATE_EMPTY
        return null
      canChange = true
      nextState = Grid.STATE_NANO
    elif @method == @METHOD.METHOD_ONE
      # If we neighbor a seed cell and have no other neighbors, we have
      # a 0.5/26 chance of being populated

      # If we have exactly two neighbors that aren't touching and are in
      # a straight line oriented with the x, y, or z axes, we are populated.

      # If we have exactly one neighbor, we have a 0.5/25 chance.  Some
      # other percentage of that turns into dead spots.

      if curState != Grid.STATE_EMPTY
        return null

      seed = 0
      total = 0
      dead = 0
      poles = [ 0, 0, 0 ]
      for nz in [-1:2]
        for ny in [-1:2]
          for nx in [-1:2]
            neigh = @_wrapGet(x + nx, y + ny, z + nz)
            if neigh == Grid.STATE_SEED
              seed += 1
              total += 1
            elif neigh == Grid.STATE_DEAD
              dead += 1
              total += 1
            elif neigh != Grid.STATE_EMPTY
              total += 1

            if neigh != Grid.STATE_EMPTY and neigh != Grid.STATE_DEAD
              # poles - crossbars through cardinal directions
              if nx == 0 and ny == 0
                if nz == 1
                  poles[0] += 1
                elif nz == -1
                  poles[0] += 1
              elif nx == 0 and nz == 0
                # implied ny != 0, otherwise first if would trigger
                poles[1] += 1
              elif ny == 0 and nz == 0
                # implied nx != 0, otherwise first if would trigger
                poles[2] += 1

      if seed == 1 and total == 1
        canChange = true
        if Math.random() < 0.5 / 26
          nextState = Grid.STATE_NANO

      if nextState == 0 and total <= 3 and (poles[0] == 2 or poles[1] == 2
          or poles[2] == 2)
        canChange = true
        nextState = Grid.STATE_NANO

      elif total == 1 and dead == 0
        canChange = true
        if Math.random() < 0.5 / 25
          if Math.random() < 0.1
            nextState = Grid.STATE_DEAD
          else
            nextState = Grid.STATE_NANO
    elif @method == @METHOD.METHOD_TWO
      # Focus on non-diagonal movement

      if curState != Grid.STATE_EMPTY
        return null

      spawners = 0
      spawnSeed = 0
      inhibitors = 0
      poles = [ 0, 0, 0 ]
      for nz in [-1:2]
        for ny in [-1:2]
          for nx in [-1:2]
            # We use below a moore neighborhood - exclude outer corners.
            # Otherwise, we count too many inhibitors
            if nx and ny and nz
              continue
            neigh = @_wrapGet(x + nx, y + ny, z + nz)
            if neigh != Grid.STATE_EMPTY
              if not (
                  nx == 0 and ny == 0 or ny == 0 and nz == 0
                  or nx == 0 and nz == 0)
                inhibitors += 1
              else
                spawners += 1
                if neigh == Grid.STATE_SEED
                  spawnSeed += 1
                if nx
                  poles[0] += 1
                elif ny
                  poles[1] += 1
                else
                  poles[2] += 1

      if spawnSeed == 1
        canChange = true
        nextState = Grid.STATE_NANO
      elif spawners == 1 and inhibitors == 0
        # Linear growth
        canChange = true
        if Math.random() < 0.5
          nextState = Grid.STATE_NANO
      elif spawners == 1 and inhibitors == 1 and not @_isBorder(x, y, z)
        # Turn, just not into a border
        canChange = true
        # NOTE - a high turn rate leads to higher connectivity, but also more
        # wires required.
        TURN_EVERY = 100
        if Math.random() < 0.5 / TURN_EVERY
          nextState = Grid.STATE_NANO
      elif 2 in poles and inhibitors < 4
        # Connect two close-together wires; 4 inhibitors means those wires
        # are complete.
        canChange = true
        nextState = Grid.STATE_NANO
    elif @method == Grid.METHOD.METHOD_THREE
      # Like METHOD_TWO, but with a tip for each growing wire.
      if curState == Grid.STATE_DEAD
        return [ Grid.STATE_NANO, false ]
      elif curState != Grid.STATE_EMPTY
        return null

      spawners = 0
      spawnSeed = 0
      inhibitors = 0
      poles = [ 0, 0, 0 ]
      for nz in [-1:2]
        for ny in [-1:2]
          for nx in [-1:2]
            # We use below a moore neighborhood - exclude outer corners.
            # Otherwise, we count too many inhibitors
            if nx and ny and nz
              continue
            neigh = @_wrapGet(x + nx, y + ny, z + nz)
            if neigh != Grid.STATE_EMPTY
              if not (
                  nx == 0 and ny == 0 or ny == 0 and nz == 0
                  or nx == 0 and nz == 0)
                inhibitors += 1
              else
                if neigh != Grid.STATE_NANO
                  # A tip or a seed
                  spawners += 1
                  if neigh == Grid.STATE_SEED
                    spawnSeed += 1

                polePart = 1
                if neigh == Grid.STATE_DEAD
                  polePart = 2

                if nx
                  poles[0] += polePart
                elif ny
                  poles[1] += polePart
                else
                  poles[2] += polePart

      if spawnSeed
        canChange = true
        nextState = Grid.STATE_DEAD
      elif spawners == 1 and inhibitors == 0
        # Linear growth
        canChange = true
        nextState = Grid.STATE_DEAD
      elif spawners == 1 and inhibitors == 1 and not @_isBorder(x, y, z)
        # Turn
        canChange = true
        if Math.random() < 0.1
          nextState = Grid.STATE_DEAD
      elif 3 in poles
        # Connect two close-together wires when one is growing
        canChange = true
        nextState = Grid.STATE_NANO
    else
      throw new Error("Unrecognized update #{ @METHOD.label(@method) }")

    return [ nextState, canChange ]


  _wrapGet: (x, y, z) ->
    """If x,y,z falls on our grid, return that cell's state.  Otherwise, return
    empty."""
    if x >= 0 and x < @size
        and y >= 0 and y < @size
        and z >= 0 and z < @sizeZ
      ni = x + @size * (y + @size * z)
      return @states[ni]

    return Grid.STATE_EMPTY
