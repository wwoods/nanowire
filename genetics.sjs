
require seriousjs as sjs

class GeneticSolver
  """Solves a problem via genetic algorithms"""
  constructor: () ->
    # { cell name : { inputs: [ i1, i2, ... ], input bits : cell output bit,
    #    refs: number of cells relying on this one directly or indirectly } }
    @tables = {}


  solve: (equations, grid, connections) ->
    """Given
    equations - Semicolon delimited string like "o1=i1 + i2;o2 = i2".  If any
        expression is non-zero, output will be 1.  Otherwise, output is 0.  An
        output may be unspecified for don't care.

    grid - a Grid object that defines the inputs, hidden, and output topology.

    connections - a Grid.connect() result object.

    Populate our @tables with a solution table for each node.
    """
    @tables = {}
    # Used for genome
    tableOrder = []
    if not connections?
      return

    # Step 0 - find and organize our output functions as terms of inputs
    oldDefine = window.define
    try
      r = @_resolveOutputs(equations, grid)
      ofuncs = r[0]
      outputBitstream = r[1]
    finally
      window.define = oldDefine

    # ofuncs now defines which outputs we care about, and outputBitstream
    # defines all permutations in the final output table.  Now, determine inputs
    # to each node
    for si in grid.hidden.concat(grid.outputs)
      name = grid.matchCell(si)
      t = @tables[name] = { name: name, inputs: [], refs: 0 }
      tableOrder.push name
      for c in grid.getSpecialCells()
        if c == si
          continue
        if not connections.matrix[c][si]?
          continue
        t.inputs.push grid.matchCell(c)

    # ref count, this way we know who to compute the output of first so that
    # calculations are combinatorially stable
    tree = {}
    addRefs = (c) ->
      if not c?
        return
      if c.name of tree
        console.log @tables
        throw new Error("Cycle detected")

      tree[c.name] = 1
      c.refs += 1
      for inputName in c.inputs
        addRefs(@tables[inputName])
      delete tree[c.name]
    for _, c of @tables
      addRefs(c)

    tableOrder.sort (a, b) -> @tables[b].refs - @tables[a].refs

    # Next step - we now have an ordered calculation tree, change it into a
    # genome that describes the input -> output transformation for each tree.
    # Then we'll recombine and mutate that genome until we have our result.
    for t in tableOrder
    console.log tableOrder
    console.log @tables


  _resolveOutputs: (equations, grid) ->
    window.define = (a, b) -> lastOutput[0] = b()
    ofuncs = []
    lastOutput = [ null ]
    inArgs = []
    for i in [:grid.inputs.length]
      inArgs.push grid.nameInput(i)
    inArgs = inArgs.join(',')
    for o in grid.outputs
      ofuncs.push null
    for s in equations.split(';')
      sa = s.trim().split('=')
      if sa.length != 2
        throw new Error("Bad equation: #{ s }")
      oIndex = parseInt(sa[0].trim().substring(1))
      ofuncs[oIndex] = new Function(inArgs,
          sjs.getJsForEval('o=' + sa[1].trim()))

    # Step 1 - generate a oo_oo_oo_oo... bitstream for all possible inputs;
    # outputs with a null arg are excluded
    outputBitstream = []
    for i in [:Math.pow(2, grid.inputs.length)]
      # high <- low bit order in i.
      ins = []
      j = i
      for _ in grid.inputs
        if j & 1
          ins.push 1
        else
          ins.push 0
        j = j >> 1
      for o in ofuncs
        if not o?
          continue
        o.apply null, ins
        outputBitstream.push lastOutput[0].o and 1 or 0
    return [ ofuncs, outputBitstream ]
