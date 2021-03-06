# nanowireGrowth

Screenshots and analysis images are in "img" folder.

## Usage

A basic web application with no server component; just open index.html in your
browser!

Note that if you are using a browser (e.g. Chrome) with tighter security settings,
you may have to launch a simple web server in order to run this static webpage.  
I would recommend using either npm's http-server or Python from the project's
directory (running bootstrap.sjs will attempt to use http-server,
or give a helpful error message):

    $ http-server -p 8080

or

    $ python -m SimpleHTTPServer 8080

> Powered by [SeriousJs](https://github.com/wwoods/seriousjs)

## Description

Contains five main source files:

* grid.sjs - Actual Cellular Automata update and stats calculation code, as well
  as connectivity used by Genetic Algorithms / calculation
* genetics.sjs - Rules for learning computation tables based on connectivity.
* analyze.sjs - Run trials of different algorithms to compare statistics
* analyzeConnectivity.sjs - Run trials of different CA algorithms in order to
    discern the best connectivity pattern.
* index.sjs - Client code for displaying Cellular Automata grids, connectivity,
    genetic algorithm information, etc.


img/ folder contains screenshots and presentation slides in PDF form.

Connectivity flows forward or sideways only, it does not go backward.  This is
so that we do not get cycles.  It may be thought of as nanowires are only
permitted to grow in one direction and their conductance can only head in the
same direction as growth.  This may be realized via temporal multiplexing or
perhaps different, distinguishable AC currents put through the nanowire at
the same time.  Not the most efficient connectivity, but physically very
straightforward to construct.

Example output from analyze.sjs and analyzeConnectivity.sjs are in the files
analyze.out and analyzeConnectivity.out


## Genetic Algorithm

Single-child splice and mutate; two parents are taken according to monte carlo
selection with a squared fitness function.  That is, if one member of the
population scores 50% correct output and another scores 25% correct output, then
the 50% member is 4 times as likely to be chosen for procreation than the 25%
member.

Genomes are the concatenated output tables; that is, if we have 2 hidden nodes
and one output node, then there will be 3 segments within the genome.  If the
first hidden node has 3 inputs and the second hidden node has 2 inputs, then
the first segment of the genome will have 2^3 = 8 bits, and the second segment
will have 2^2 = 4 bits.


## Hill Climbing Algorithm

As a complement to the GA implementation, this source also provides a means
of resolving solution tables via a hill climbing approach.  In parallel with
the genetic implementation, there is a distinct population of N members.  Rather
than sexual reproduction, asexual reproduction is used, and mutation becomes a
bit smarter.  One node's table is updated at a time, with a random set of bits
being flipped each generation.  When the score is no longer better, the
algorithm reverts to the previously known bit configuration, and then a
different section is chosen for update.


## Cellular Automata Algorithms

### Cell states

* EMPTY - Represents a cell with no wire content
* SEED - Represents a "seed" cell out of which nanowires grow
* NANO - Represents a cell populated with nanowire
* DEAD - Context dependent; either a cell that inhibits growth around it
    (for METHOD_ONE) or a cell that is the tip of a growing nanowire
    (for METHOD_THREE).

### Update methods

Note that METHOD_TWO is the best.

#### FILL

Neighborhood: None.

If any cell is not in the SEED state, it immediately becomes the NANO state.


#### METHOD_ONE

Neighborhood: Moore (immediately adjacent neighbors including diagonals)

Only EMPTY cells are updated.  Neighbors are counted into three buckets: SEED,
NANO, and DEAD.  Non-DEAD neighbors, if they align with the current cell on
either the X, Y, or Z axis, will populate a "poles" array.  In other words, if
poles[x] == 2, then the current cell, when populated, would form a straight line
of wire on the X axis with its two neighbors.

Update rules:

* If there is exactly one neighbor to the current EMPTY cell, and it is a SEED,
  then the current cell has a 1 / 52 chance of being populated with NANO.

* If there are 3 or less neighbors (including poles), and one of the poles is
  populated (that is, the current cell would complete a linear wire segment
  aligned with the X, Y, or Z axis), then the current cell is populated with
  NANO.

* If there is exactly 1 populated neighbor, and it is not dead, the current cell
  has a 0.9/52 chance of being populated with NANO.  It has a 0.1/52 chance of
  being populated with DEAD.

#### METHOD_TWO

Neighborhood: 2D Moore neighborhood; 3D Moore minus four.  That is, in 3D space,
the 3-dimensional corners are not included.  Essentially, the neighborhood is
the union of all 3 axis-aligned 2D moore neighborhood planes.

Building on the "poles" concept from above, consider all 20 non-pole aligned
neighbors (there are 6 that are part of poles).  These are "inhibiting" if they
are not EMPTY.

Update rules:

* If there is a SEED in a pole position, current cell becomes NANO.

* If there is one non-EMPTY in a pole position, and there are no inhibitors,
  current cell becomes NANO with 50% chance.  This accomplishes linear growth
  out of wires.

* If there is one non-EMPTY in a pole position, exactly 1 inhibitor, and this
  cell is not on the border of the world, then there is a 0.5% chance this
  cell will become NANO.  This accomplishes "turning" for wire tips.

* If any pole pair is complete (both axis-aligned neighbors on either side are
  non-EMPTY) and there are fewer than 4 inhibitors, current cell becomes NANO.
  This connects non-parallel wires.

#### METHOD_THREE

Neighborhood: Identical to METHOD_TWO neighborhood.

DEAD is used to indicate a growing tip of a nanowire.  If the current cell is
DEAD, it becomes NANO.  Otherwise, only EMPTY cells update.

Update rules:

* In addition to the pole logic in METHOD_ONE and METHOD_TWO, a completed pole
  in METHOD_THREE requires one neighbor to be NANO and the other DEAD.  Two DEAD
  or two NANO neighbors aligned in a pole will not create a connection.  If a pole
  is complete in this fashion, then current cell will be populated with NANO.

* If any of the pole neighbors are SEED, current cell becomes DEAD.

* If exactly one pole neighbors is DEAD, and there are no inhibitors, current
  cell becomes DEAD.

* If exactly one pole neighbor is DEAD, and there is exactly 1 inhibitor,
  current cell becomes DEAD with 10% chance.


## Cellular Automata Analysis

See "img" folder for stats10x10.pdf and stats20x20.pdf, which display graphs
based on "output" file generated by analyze.sjs for 10x10(x10) and 20x20(x20)
graphs.

See "img" folder for screenshots.pdf as well, which shows application features.

Analysis based on 10x10 and 20x20 grid sizes, both 2D and 3D.  It is
undesirable that any of the seed nodes would be unreachable by all other seed
nodes in the network.  This could correspond to functionality that has been
broken due to defects in the growth process.  Note that diagonally touching
cells count as connected to one another.

In all algorithms, the likelihood of a fully connected chip increases as the
number of seed points increases.  In a 10x10 grid, all except METHOD_ONE have
great connectivity with 8 seeds.  Manual inspection shows that a lot of
METHOD_ONE's issues come from not being able to bridge the following
configuration:

    =====
    =X  =
    =  X=
    =   =
    =====

That is, the current cell would need to be populated to connect two separate
networks, but the neighbors are not both part of the same pole.

The other methods do not tend to get into this situation as often, as they
do not grow diagonally, only growing aligned with the x, y, and z axes.  A large
part of the reason that the other methods do not perform as well as METHOD_ONE
with only two seeds is that the other methods all have a "turn" mechanism which
is probabilistic.  In a small grid (especially 3d), there are fewer chances for
turning, meaning that it is less likely that the traces from each seed point
will meet.  Since METHOD_ONE grows diagonally in addition to linearly, it does
not have this problem.  Put another way, it "turns" much more frequently.

The problems with METHOD_ONE can be seen in the "Fill" graphs, which show
the percentage of possible space filled with nanowires by each algorithm.  This
is where METHOD_TWO and to a lesser extent METHOD_THREE do well.  Less space
used might translate to lower costs and less raw material, as more seed
configurations may be completed from the same amount of nanowire.  They are
also more efficient in terms of limiting the number of "spurs," or wires unused
by any shortest paths between two seed points.  See the third row of figures,
"Wire Usage," for this.  
