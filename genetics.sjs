
require seriousjs as sjs

class BitGenome
  constructor: (nbits = 0) ->
    @bits = []
    @generation = 0
    for i in [:nbits]
      @bits.push Math.random() >= 0.5 then 1 else 0


  overwriteTables: (solver) ->
    """Given a GeneticSolver, overwrite solver.tables[].outputs with the
    information from our genome."""
    ts = solver.tableStarts
    for t, i in solver.tableOrder
      nBits = Math.pow(2, solver.tables[t].inputs.length)
      solver.tables[t].outputs = @bits[ts[i]:ts[i] + nBits]


  splice: (other) ->
    """Returns a new BitGenome created by combining us and other and throwing
    in random mutations."""
    r = new BitGenome()
    r.generation = @generation + 1
    split = Math.floor(Math.random() * @bits.length)
    for i in [:split]
      r.bits.push @bits[i]
    for i in [split:@bits.length]
      r.bits.push other.bits[i]
    alpha = 1
    for j in [:Math.ceil(Math.random() * @bits.length * 0.30 * alpha
        / (alpha + @generation))]
      i = Math.floor(Math.random() * @bits.length)
      if r.bits[i]
        r.bits[i] = 0
      else
        r.bits[i] = 1
    return r


  bumpLearn: (solver) ->
    """Asexual reproduction similar to what I use for parameter optimization."""
    r = new BitGenome()
    r.bits = @bits[:]
    r.lastScore = @score
    r.generation = @generation + 1
    lastBump = -1
    if not @lastScore?
      # Initialize
      @bumpSegment = null
    elif @score >= @lastScore
      # Did better or same, keep same segment, refine
      if @bumpForce >= 0.05
        @bumpForce *= 0.5
      else
        lastBump = @bumpSegment
    else
      # Did worse, revert and change segment
      r.bits = @originalBits
      lastBump = @bumpSegment

    alpha = 10
    while @bumpSegment == lastBump
      @bumpSegment = Math.floor(Math.random() * solver.tableStarts.length)
      @bumpForce = 0.6 * alpha / (alpha + @generation)

    r.bumpSegment = @bumpSegment
    r.bumpForce = @bumpForce

    segStart = solver.tableStarts[r.bumpSegment]
    segEnd = r.bits.length
    if r.bumpSegment < solver.tableStarts.length - 1
      segEnd = solver.tableStarts[r.bumpSegment + 1]

    r.originalBits = r.bits[:]
    for _try in [:Math.ceil(Math.random() * r.bumpForce * (segEnd - segStart))]
      p = Math.floor(Math.random() * (segEnd - segStart))
      b = segStart + p
      if r.bits[b]
        r.bits[b] = 0
      else
        r.bits[b] = 1

    return r


class GeneticSolver
  """Solves a problem via genetic algorithms"""

  EVOLVE: new sjs.Enum(
      "GA"
      "HC"

  constructor: (@grid) ->
    # Reset our vars
    @solve()


  runTables: (inArgs) ->
    """Given an array of input arguments inArgs, look up output in each @tables
    entry and return a dictionary containing all node names : node values."""
    results = {}
    for v, i in inArgs
      results[@grid.nameInput(i)] = v
    for t, i in @tableOrder
      index = 0
      indexSet = 1
      for j in @tables[t].inputs
        r = results[j]
        if not r?
          throw new Error("Could not find results[#{ j }] during calculation")
        if r
          index += indexSet
        indexSet *= 2
      results[t] = @tables[t].outputs[index]
    return results


  solve: (equations, connections, {< learnType = GeneticSolver.EVOLVE.GA, populationSize = 20, maxRounds = 1000}) ->
    """Given
    equations - Semicolon delimited string like "o1=i1 + i2;o2 = i2".  If any
        expression is non-zero, output will be 1.  Otherwise, output is 0.  An
        output may be unspecified for don't care.

    connections - a Grid.connect() result object.

    Populate our @tables with a solution table for each node.

    Returns object: { score: best score, rounds: # of rounds taken,
        evaluations: # of fitness evaluations run }
    """
    # { cell name : { inputs: [ i1, i2, ... ], outputs[number from i3, i2, i1] : cell output bit,
    #    refs: number of cells relying on this one directly or indirectly } }
    @tables = {}
    # Used for genome
    @tableOrder = []
    @tableStarts = []
    if not connections?
      return

    # Step 0 - find and organize our output functions as terms of inputs
    if window?
      oldDefine = window.define
    try
      r = @_resolveOutputs(equations)
      ofuncs = r[0]
      outputBitstream = r[1]
    finally
      if window?
        window.define = oldDefine

    # ofuncs now defines which outputs we care about, and outputBitstream
    # defines all permutations in the final output table.  Now, determine inputs
    # to each node
    for si in @grid.hidden.concat(@grid.outputs)
      name = @grid.matchCell(si)
      t = @tables[name] = { name: name, inputs: [], refs: 0 }
      @tableOrder.push name
      for c in @grid.getSpecialCells()
        if c == si
          continue
        if not connections.matrix[c][si]?
          continue
        t.inputs.push @grid.matchCell(c)

    # Now that we have an input tree, prune it back so that we HAVE to infer
    # inputs through children...  In other words, inputs to my inputs are not
    # my inputs.
    prunedInputsT = {}
    for si in @grid.hidden.concat(@grid.outputs)
      name = @grid.matchCell(si)
      t = @tables[name]
      prunedInputs = prunedInputsT[name] = t.inputs[:]
      for i in t.inputs
        t2 = @tables[i]
        if t2?
          for j in t2.inputs
            tj = prunedInputs.indexOf(j)
            if tj >= 0
              prunedInputs.splice(tj, 1)
    for tname, inputs of prunedInputsT
      @tables[tname].inputs = inputs

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

    @tableOrder.sort (a, b) -> @tables[b].refs - @tables[a].refs

    # Next step - we now have an ordered calculation tree, change it into a
    # genome that describes the input -> output transformation for each tree.
    # Then we'll recombine and mutate that genome until we have our result.
    bitsNeeded = 0
    for t in @tableOrder
      @tableStarts.push bitsNeeded
      bitsNeeded += Math.pow(2, @tables[t].inputs.length)

    if window?
      console.log @tableOrder
      console.log @tableStarts
      console.log @tables

    population = []
    for i in [:populationSize]
      population.push new BitGenome(bitsNeeded)

    totalScore = 0.0
    getRandom = () ->
      part = Math.random() * totalScore
      for p in population
        part -= p.score
        if part <= 0.0
          return p
      return population[-1:][0]

    for round in [:maxRounds]
      totalScore = 0.0
      bestScore = -1.0
      best = null
      for p in population
        p.score = @_score(p, @grid.inputs.length, outputBitstream)
        totalScore += p.score
        if p.score > bestScore
          bestScore = p.score
          best = p

      if bestScore == 1.0
        break

      newPop = []
      for i in [:population.length]
        first = getRandom()
        if learnType == @EVOLVE.GA
          second = first
          for _try in [:population.length]
            # discourage asexual reproduction
            second = getRandom()
            if second != first
              break
          newPop.push first.splice(second)
        elif learnType == @EVOLVE.HC
          newPop.push first.bumpLearn(@)
        else
          throw new Error("Bad learnType: #{ learnType }")
      population = newPop

    # Use best
    best.overwriteTables(@)
    # If we broke early, we actually did one more round
    if round < maxRounds
      round += 1

    return {
        score: Math.sqrt(bestScore)
        rounds: round
        evaluations: round * population.length


  _resolveOutputs: (equations) ->
    if window?
      window.define = (a, b) -> lastOutput[0] = b()
    ofuncs = []
    lastOutput = [ null ]
    inArgs = []
    for i in [:@grid.inputs.length]
      inArgs.push @grid.nameInput(i)
    for o in @grid.outputs
      ofuncs.push null
    for s in equations.split(';')
      if s.trim().length == 0
        continue
      sa = s.trim().split('=')
      if sa.length != 2
        throw new Error("Bad equation: #{ s }")
      oIndex = parseInt(sa[0].trim().substring(1))
      if sjs.getJsForEval?
        ofuncs[oIndex] = new Function(inArgs.join(','),
            sjs.getJsForEval('o=' + sa[1].trim()))
      else
        vm = require('vm')
        functionSandbox = vm.createContext()
        lastOutput[0] = functionSandbox
        ofuncs[oIndex] = () ->
          for name, i in inArgs
            functionSandbox[name] = arguments[i]
          sjs.eval "o=" + sa[1].trim(), sandbox: functionSandbox

    # Step 1 - generate a oo_oo_oo_oo... bitstream for all possible inputs;
    # outputs with a null arg are excluded
    outputBitstream = []
    for i in [:Math.pow(2, @grid.inputs.length)]
      # high <- low bit order in i.
      ins = []
      j = i
      for _ in @grid.inputs
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


  _score: (organism, numInputs, expectedOutputs) ->
    """Returns a [0, 1] score for organism, with 1.0 being perfect."""
    organism.overwriteTables(@)
    outNames = []
    for o in [:@grid.outputs.length]
      outNames.push @grid.nameOutput(o)
    matched = 0
    matchedIndex = 0
    inArgs = []
    for i in [:Math.pow(2, numInputs)]
      ib = i
      for j in [:numInputs]
        inArgs[j] = ib & 1
        ib = ib >> 1
      outputs = @runTables(inArgs)
      for o in outNames
        if expectedOutputs[matchedIndex] == outputs[o]
          matched += 1
        matchedIndex += 1
    if expectedOutputs.length != matchedIndex
      throw new Error("Bad number of outputs (#{ matchedIndex } / #{ expectedOutputs.length })")
    r = matched / expectedOutputs.length
    return r * r
