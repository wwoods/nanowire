"""Analyzes the GA's ability to deduce an answer."""

require ./genetics for GeneticSolver
require ./grid for Grid

getEstimatedError = (avg, dev, trialCount) ->
  """Returns estimated [0, 100]% error in avg from the true population mean.
  """
  if trialCount > 10
    zc = 2.23
  elif trialCount > 5
    zc = 2.57
  elif trialCount > 4
    zc = 2.78
  elif trialCount > 3
    zc = 3.18
  elif trialCount > 2
    zc = 4.30
  else
    zc = 12.71
  r = 100.0 * zc * dev / (Math.abs(avg) * Math.sqrt(trialCount))
  return r


g = new Grid()
gs = new GeneticSolver(g)
seeds = "3:5:2"
gsEquations = "o1=(i1+i2+i3)&1; o2=i1+i2+i3>1"
console.log "update,tableSolver,sizeXY,sizeZ,seedPattern,trials,numRight,score,scoreDev,evals,evalsDev"

sqr = (x) -> x * x
for method in [ Grid.METHOD.METHOD_TWO ]  # Grid.METHOD.all()
  g.method = method
  for s in [10,20]
    for z in [1,s]
      # Do both trials on same connectivity graph, so that it's a fair
      # comparison
      trialsG = []
      trialsH = []
      for trial in [:100]
        if z
          g.reset(seeds, s)
        else
          g.reset(seeds, s, 1)

        g.updateFinish()
        conn = g.connect()
        trialsG.push gs.solve(gsEquations, conn, learnType:
            GeneticSolver.EVOLVE.GA)
        trialsH.push gs.solve(gsEquations, conn, learnType:
            GeneticSolver.EVOLVE.HC)

        if trial >= 5 and false
          # Check expected error on a metric that is likely to change (not
          # connectivity!)
          wireUse = 0.0
          for t in trials
            wireUse += t.evaluations
          wireUse /= trials.length
          devUse = 0.0
          for t in trials
            devUse += sqr(t.evaluations - wireUse)
          devUse = Math.sqrt(devUse / (trials.length - 1))
          if getEstimatedError(wireUse, devUse, trials.length) < 10.0
            # No need to run more!
            # No early breaks... break
            continue

      numRightG = 0
      avgScoreG = 0
      avgEvalsG = 0
      numRightH = 0
      avgScoreH = 0
      avgEvalsH = 0

      for t, i in trialsG
        if t.score == 1.0
          numRightG += 1
        avgScoreG += t.score
        avgEvalsG += t.evaluations

        if trialsH[i].score == 1.0
          numRightH += 1
        avgScoreH += trialsH[i].score
        avgEvalsH += trialsH[i].evaluations

      fac = 1.0 / trialsG.length
      avgScoreG *= fac
      avgEvalsG *= fac
      numRightG *= fac
      avgScoreH *= fac
      avgEvalsH *= fac
      numRightH *= fac

      devScoreG = 0.0
      devEvalsG = 0.0
      devScoreH = 0.0
      devEvalsH = 0.0
      for t, i in trialsG
        devScoreG += sqr(t.score - avgScoreG)
        devEvalsG += sqr(t.evaluations - avgEvalsG)
        devScoreH += sqr(trialsH[i].score - avgScoreH)
        devEvalsH += sqr(trialsH[i].evaluations - avgEvalsH)

      fac = 1 / (trialsG.length - 1)
      devScoreG = Math.sqrt(fac * devScoreG)
      devEvalsG = Math.sqrt(fac * devEvalsG)
      devScoreH = Math.sqrt(fac * devScoreH)
      devEvalsH = Math.sqrt(fac * devEvalsH)

      console.log "#{ Grid.METHOD.label(method) },"
          + "#{ GeneticSolver.EVOLVE.label(GeneticSolver.EVOLVE.GA) },"
          + "#{ s },#{ z },#{ seeds },"
          + "#{ trialsG.length },#{ numRightG },"
          + "#{ avgScoreG },#{ devScoreG },#{ avgEvalsG },#{ devEvalsG }"
      console.log "#{ Grid.METHOD.label(method) },"
          + "#{ GeneticSolver.EVOLVE.label(GeneticSolver.EVOLVE.HC) },"
          + "#{ s },#{ z },#{ seeds },"
          + "#{ trialsG.length },#{ numRightH },"
          + "#{ avgScoreH },#{ devScoreH },#{ avgEvalsH },#{ devEvalsH }"
