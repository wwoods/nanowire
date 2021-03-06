
require seriousjs as sjs
require ./genetics for GeneticSolver
require ./grid for Grid

class GridDisplay uses sjs.EventMixin
  """Maps a Grid to some THREEJS boxes in a grid formation.
  """
  MODE_NORMAL: 0
  MODE_CONNECT: 1

  MAT_CONNECT: 100
  MAT_CONNECT_UNUSED: 101
  MAT_SEED_ON: 102
  MAT_SEED_OFF: 103

  boxSize: 50.0

  constructor: (@grid, @scene, @camera, @overlay) ->
    @meshes = []
    @mats = {}
    @mats[Grid.STATE_SEED] = new THREE.MeshLambertMaterial(color: 0xff0000)
    @mats[Grid.STATE_NANO] = new THREE.MeshLambertMaterial(color: 0xffffff)
    @mats[Grid.STATE_DEAD] = new THREE.MeshLambertMaterial(color: 0x0000ff)

    @mats[GridDisplay.MAT_CONNECT] = new THREE.MeshLambertMaterial(
        color: 0x00ff00, opacity: 1.0)
    @mats[GridDisplay.MAT_CONNECT_UNUSED] = new THREE.MeshLambertMaterial(
        color: 0xffffff, opacity: 0.6)
    @mats[GridDisplay.MAT_SEED_ON] = new THREE.MeshLambertMaterial(
        color: 0xff0000, opacity: 1.0)
    @mats[GridDisplay.MAT_SEED_OFF] = new THREE.MeshLambertMaterial(
        color: 0xddcccc, opacity: 0.6)

    @geometry = new THREE.BoxGeometry(@boxSize, @boxSize, @boxSize)
    @mode = GridDisplay.MODE_NORMAL

    @projector = new THREE.Projector()
    # cell id : text label
    @labels = {}

    @resize()
    @render()
    @grid.event.on 'updatePost', @@render
    @grid.event.on 'resize', @@resize
    @grid.event.on 'reset', ->
      @states = {}


  getState: (name) ->
    return @states[name] then 1 else 0


  raycast: (px, py) ->
    """Returns the x, y, z of the grid cell clicked given
    px, py where the click occurred (both [0, 1] in client space)"""
    vec = new THREE.Vector3(px * 2.0 - 1, -py * 2.0 + 1, 0.5)
    @projector.unprojectVector(vec, @camera)

    raycaster = new THREE.Raycaster(@camera.position,
        vec.sub(@camera.position).normalize())
    intersects = raycaster.intersectObjects(@meshes)
    ri = null
    r = null
    if intersects.length
      ri = intersects[0].object.appIndex
      r = intersects[0].object.appPos
    @event.trigger "pickCell", ri, r


  resize: () ->
    if @outer?
      @scene.remove @outer

    outerSize = @boxSize * @grid.size + 1
    @outerMat = new THREE.MeshBasicMaterial(color: 0x000000, wireframe: true)
    @outerBox = new THREE.BoxGeometry(outerSize, outerSize,
        @boxSize * @grid.sizeZ + 1)
    @outer = new THREE.Mesh(@outerBox, @outerMat)
    @scene.add @outer


  render: () ->
    i = 0
    oldMeshes = @meshes
    @meshes = []
    @meshMap = {}

    halfDim = @boxSize * 0.5 * (@grid.size - 1)
    halfDimZ = @boxSize * 0.5 * (@grid.sizeZ - 1)
    for z in [:@grid.sizeZ]
      for y in [:@grid.size]
        for x in [:@grid.size]
          if @grid.states[i]
            mesh = oldMeshes.pop()
            if not mesh?
              mesh = new THREE.Mesh(@geometry)
              @scene.add(mesh)

            if @mode == GridDisplay.MODE_NORMAL
              mesh.material = @mats[@grid.states[i]]
            elif @mode == GridDisplay.MODE_CONNECT
              if @grid.states[i] == Grid.STATE_SEED
                name = @grid.matchCell(i)
                if @states[name]
                  mesh.material = @mats[GridDisplay.MAT_SEED_ON]
                else
                  mesh.material = @mats[GridDisplay.MAT_SEED_OFF]
              elif @connections.members[i]
                mesh.material = @mats[GridDisplay.MAT_CONNECT]
              else
                mesh.material = @mats[GridDisplay.MAT_CONNECT_UNUSED]
            else
              throw new Error("Unknown mode #{ @mode }")
            mesh.position.set(x * @boxSize - halfDim, y * @boxSize - halfDim,
                z * @boxSize - halfDimZ)
            mesh.appIndex = i
            mesh.appPos = [ x, y, z ]
            @meshes.push mesh
            @meshMap[i] = mesh
          i += 1

    for m in oldMeshes
      @scene.remove(m)


  setMode: (@mode) ->
    if @mode == GridDisplay.MODE_CONNECT
      # Fills in @connections with whether or not blocks are part of the
      # shortest path between two nodes.
      @connections = @grid.connect()
    else
      @connections = null
    @event.trigger "connections", @grid, @connections
    @render()


  setState: (name, newState) ->
    @states[name] = newState


  updateStates: (solver) ->
    """Given a GeneticSolver, update all of our node states based on current
    input states."""
    inArgs = []
    for i in [:@grid.inputs.length]
      inArgs.push(@states[@grid.nameInput(i)] then 1 else 0)
    @states = solver.runTables(inArgs)
    @render()


  frame: () ->
    oldLabels = @labels
    @labels = {}
    wwidth = $('canvas').innerWidth()
    wheight = $('canvas').innerHeight()
    addLabel = (label, cellIndex) ->
      t = oldLabels[cellIndex]
      if not t?
        t = $('<div class="nodeLabel">').appendTo(@overlay)
        async
          t.bind "click", (e) ->
            @event.trigger "pickCell", cellIndex, [ -1, -1, -1 ]
            e.stopPropagation()
      else
        delete oldLabels[cellIndex]
      if t.text() != label
        t.text(label)
      vec = @projector.projectVector(@meshMap[cellIndex].position.clone(),
          @camera)
      t.css(
          left: (vec.x + 1) / 2 * wwidth - t.width() / 2
          top: -(vec.y - 1) / 2 * wheight - t.height() / 2
      @labels[cellIndex] = t

    for si, i in @grid.inputs
      addLabel @grid.nameInput(i), si, true
    for si, i in @grid.outputs
      addLabel @grid.nameOutput(i), si
    for si, i in @grid.hidden
      addLabel @grid.nameHidden(i), si

    for _cell, unused of oldLabels
      unused.remove()


$ ->
  $('body').empty()

  SHADOW = false

  scene = new THREE.Scene()
  cam = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight,
      1, 10000)
  cam.position.z = 1000
  controls = new THREE.TrackballControls(cam)
  controls.target.set(0, 0, 0)

  box = new THREE.BoxGeometry(50, 50, 50)
  material = new THREE.MeshLambertMaterial(color: 0xffffff, opacity: 1)

  grid = new Grid(10, 1)
  container = $('<div class="container">').appendTo('body')
  overlay = $('<div class="overlay">').appendTo(container)
  gridDisplay = new GridDisplay(grid, scene, cam, overlay)

  ###
  mesh = new THREE.Mesh(box, material)
  mesh.position.x = -500
  scene.add mesh
  SHADOW and (mesh.castShadow = true
  SHADOW and (mesh.receiveShadow = true
  ###

  amb = new THREE.AmbientLight(0x101010)
  scene.add amb

  light1 = new THREE.DirectionalLight(0xffffff)
  light1.position.set(0.5, 1.0, 1.0).normalize()
  scene.add light1
  light2 = new THREE.DirectionalLight(0x80808f)
  light2.position.set(-0.5, -0.5, -1).normalize()
  scene.add light2

  SHADOW and (light1.castShadow = light2.castShadow = true

  renderer = new THREE.CanvasRenderer()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(new THREE.Color(0xd0d0d0))
  SHADOW and (renderer.shadowMapEnabled = true

  container.prepend(renderer.domElement)
  overlay.bind "click", (e) ->
    gridDisplay.raycast(e.pageX / overlay.innerWidth(),
        e.pageY / overlay.innerHeight())

  helpBar = $('<div class="help">').appendTo('body')
  helpBar.text("Click and drag to rotate; right click and drag to move; "
      + "mouse wheel to zoom")
  $('<br />').appendTo(helpBar)
  gaInfo = $('<div class="gaInfo">').appendTo(helpBar)
  gaInfo.bind "click mousewheel mousemove mouseup mousedown", (e) ->
    e.stopPropagation()

  infoBar = $('<div class="controls">').appendTo('body')
  infoBar.bind "mousedown click", (e) ->
    e.stopPropagation()

  statBar = $('<div>').appendTo(infoBar)

  # === Percent info ===
  percentFilled = $('<div><span />% populated after <span /> step(s); '
      + '<span /> possible updates</div>')
      .appendTo(infoBar)
  lastKnownPossible = [ 0 ]
  grid.event.on "updatePost", (possibleUpdates) ->
    p = 0.0
    pDiv = grid.size * grid.size * grid.sizeZ
    for s in grid.states
      if s > 1
        p += 1
    $('span:eq(0)', percentFilled).text(p * 100 / pDiv)
    $('span:eq(1)', percentFilled).text(grid.step)
    $('span:eq(2)', percentFilled).text(possibleUpdates)
    lastKnownPossible[0] = possibleUpdates

  # === Connection info ===
  connectionInfo = $('<div>')
      .appendTo(infoBar)
  gridDisplay.event.on "connections", (grid, conn) ->
    # declared later, also updates connection info
    bestScores = updateGenetics()

    if not conn?
      connectionInfo.text "Check 'Connect' for connection stats"
      return

    connectionInfo.empty()
        .append("Using #{ (100 * conn.wireUsePct).toFixed(1) }% of wires in "
          + "connections; #{ bestScores.score*100 }% after "
          + "#{ bestScores.evaluations } evaluations")
        .append("<br>")
        .append("#{ conn.avgConnectivity.toFixed(1) } "
          + "avg connectivity; #{ conn.avgLength.toFixed(1) } avg length")


  # === Seed points ===
  seedLine = $('<div><input type="text" value="3:5:2" class="seedPoints" />'
      + ' inputs:middle:outputs, updated via <select></select></div>').appendTo(infoBar)
  seedPoints = $('input', seedLine)
  methodSelect = $('select', seedLine)
  for method in Grid.METHOD.all()
    $('<option>').val(method).text(Grid.METHOD.label(method))
        .appendTo(methodSelect)
  methodSelect.val Grid.METHOD.DEFAULT
  methodSelect.bind "change", ->
    grid.method = parseInt(methodSelect.val())

  sizeInputDiv = $('<div>').appendTo(infoBar)
  sizeInput = $('input', $('<span><input type="text" value="10" class="gridSize" /> '
      + 'cells per side</span>').appendTo(sizeInputDiv))
  flattenHidden = $('input', $('<span>; <input type="checkbox">Flatten hidden '
      + 'layer</input></span>').appendTo(sizeInputDiv))

  eqInput = $('input',
      $('<div><input type="text" value="o1=(i1+i2+i3)&1; o2=i1+i2+i3 > 1" class="equation" /> '
        + 'desired output (semicolon separated o1=f(i1, i2, ...); o2=f(i1, i2, ...))')
        .appendTo(infoBar))

  # === Normal controls ===
  controlBar = $('<div>').appendTo(infoBar)
  use3d = $('<input type="checkbox">3D</input>')
      .appendTo(controlBar)
      .bind "change", ->
        resetButton.trigger "click"
  resetButton = $('<input class="reset" type="button" value="Reset" />')
      .appendTo(controlBar)
      .bind "click", ->
        size = parseInt(sizeInput.val())
        sizeZ = size
        if not use3d.is(':checked')
          sizeZ = 1
        grid.reset(seedPoints.val(), size, sizeZ,
            flattenHidden: flattenHidden.is(':checked'))
        if connectCheck.is(':checked')
          # Clear out old connections / GA info
          gridDisplay.setMode(GridDisplay.MODE_CONNECT)
  advButton = $('<input class="advance" type="button" value="Next" />')
      .appendTo(controlBar)
      .bind "mousedown", ->
        grid.update()

        advButton.val("HOLD for fast")
        keepUpdating = [ true ]
        $(document).one "mouseup", ->
          keepUpdating[0] = false
          advButton.val("Next")

        async
          await 600ms
          while keepUpdating[0]
            grid.update()
            await 0
  finishButton = $('<input class="advance" type="button" value="Finish" />')
      .appendTo(controlBar)
      .bind "click", ->
        if lastKnownPossible[0] == 0
          resetButton.trigger "click"
        grid.updateFinish()
        # Re-do connections
        if connectCheck.is(':checked')
          gridDisplay.setMode(GridDisplay.MODE_CONNECT)

  connectCheck = $('<input type="checkbox">')
      .appendTo(controlBar)
      .after(" Connect")
      .bind "change", ->
        if connectCheck.is(':checked')
          gridDisplay.setMode(GridDisplay.MODE_CONNECT)
        else
          gridDisplay.setMode(GridDisplay.MODE_NORMAL)


  evolveCompare = $('<input class="advance" type="button" value="Compare GA to HC">')
      .appendTo(controlBar)
      .bind "click", ->
        if not connectCheck.is(':checked')
          connectCheck.prop('checked', true).trigger('change')
        # Now, solve several times and note the average
        trials = 20
        gaScore = 0.0
        gaSteps = 0.0
        hcScore = 0.0
        hcSteps = 0.0

        for _ in [:trials]
          r = genetics.solve(eqInput.val(), gridDisplay.connections,
              learnType: genetics.EVOLVE.GA)
          gaScore += r.score
          gaSteps += r.evaluations
          r = genetics.solve(eqInput.val(), gridDisplay.connections,
              learnType: genetics.EVOLVE.HC)
          hcScore += r.score
          hcSteps += r.evaluations

        gaScore /= trials
        gaSteps /= trials
        hcScore /= trials
        hcSteps /= trials
        gaInfo.empty()
            .append("<div>Averages of #{ trials } trials</div>")
            .append("<div>GA: #{ gaScore } (#{ gaSteps } evals)</div>")
            .append("<div>HC: #{ hcScore } (#{ hcSteps } evals)</div>")

  # ==== Genetic algorithm hooks ====
  genetics = new GeneticSolver(grid)
  runGrid = ->
    gridDisplay.updateStates(genetics)
  updateGenetics = ->
    r = genetics.solve(eqInput.val(), gridDisplay.connections)
    runGrid()
    return r
  eqInput.bind "change", -> gridDisplay.event.trigger "connections", grid,
      gridDisplay.connections
  gridDisplay.event.on "pickCell", (cellId, cellPos) ->
    if cellId?
      id = grid.matchCell(cellId)

      if cellId in grid.inputs
        gridDisplay.setState(id, 1 - gridDisplay.getState(id))
        runGrid()

      value = gridDisplay.getState(id)
      gaInfo.text("#{ id } - #{ value }")
      if id of genetics.tables
        gtable = genetics.tables[id]
        table = $('<table class="gaLookup">').appendTo(gaInfo)
        header = $('<tr class="header">').appendTo(table)
        for i in gtable.inputs
          $('<td>').text(i).appendTo(header)
        $('<td>').text('value').appendTo(header)
        for output, i in gtable.outputs
          ib = i
          row = $('<tr>').appendTo(table)
          for j in [:gtable.inputs.length]
            cell = $('<td>').appendTo(row)
            if ib & 1
              cell.text('1')
            else
              cell.text('0')
            ib = ib >> 1
          $('<td>').text(output then 1 else 0).appendTo(row)
    else
      gaInfo.text("Click on something!")
  gridDisplay.event.trigger "pickCell", null

  # Update loop
  animate = ->
    requestAnimationFrame(animate)
    controls.update()
    gridDisplay.frame()

    renderer.render(scene, cam)

  animate()
  resetButton.trigger "click"

  # Expose vars
  window.camera = cam
  window.box = box
  window.grid = grid
