
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
console.log "update,sizeXY,sizeZ,numSeeds,avgConn,devConn,fullyConn,"
    + "avgLength,devLength,avgUsage,devUsage,avgFill,devFill"

sqr = (x) -> x * x
for method in Grid.METHOD.all()
  g.method = method
  for s in [10,20]
    for z in [1,s]
      for seeds in ["1:2:1","3:5:2"]
        trials = []
        for trial in [:100]
          if z
            g.reset(seeds, s)
          else
            g.reset(seeds, s, 1)

          g.updateFinish()
          trials.push g.connect()

          if trial >= 5
            # Check expected error on a metric that is likely to change (not
            # connectivity!)
            wireUse = 0.0
            for t in trials
              wireUse += t.wireUsePct
            wireUse /= trials.length
            devUse = 0.0
            for t in trials
              devUse += sqr(t.wireUsePct - wireUse)
            devUse = Math.sqrt(devUse / (trials.length - 1))
            if getEstimatedError(wireUse, devUse, trials.length) < 10.0
              # No need to run more!
              break

        fullyConn = 0.0
        avgConn = 0.0
        avgLen = 0.0
        wireUse = 0.0
        wireFill = 0.0

        nseedsConn = 0
        nlastLayer = 0
        for p in seeds.split(":")
          thisLayer = parseInt(p)
          nseedsConn += nlastLayer * thisLayer
          nlastLayer = thisLayer

        for t in trials
          # Floating point errors, use a buffer...
          if t.avgConnectivity + 0.5 >= nseedsConn
            fullyConn += 1
          avgConn += t.connected / nseedsConn
          avgLen += t.avgLength
          wireUse += t.wireUsePct
          wireFill += t.wireFillPct

        fac = 1.0 / trials.length
        fullyConn *= fac
        avgConn *= fac
        avgLen *= fac
        wireUse *= fac
        wireFill *= fac

        devConn = 0.0
        devLen = 0.0
        devUse = 0.0
        devFill = 0.0
        for t in trials
          devConn += sqr(t.connected / nseedsConn - avgConn)
          devLen += sqr(t.avgLength - avgLen)
          devUse += sqr(t.wireUsePct - wireUse)
          devFill += sqr(t.wireFillPct - wireFill)

        fac = 1 / (trials.length - 1)
        devConn = Math.sqrt(fac * devConn)
        devLen = Math.sqrt(fac * devLen)
        devUse = Math.sqrt(fac * devUse)
        devFill = Math.sqrt(fac * devFill)

        console.log "#{ Grid.METHOD.label(method) },#{ s },#{ z },#{ seeds },"
            + "#{ avgConn },#{ devConn },#{ fullyConn },"
            + "#{ avgLen },#{ devLen },"
            + "#{ wireUse },#{ devUse },#{ wireFill },#{ devFill }"
