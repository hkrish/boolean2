

/*!
 * 
 * Vector boolean operations on paperjs objects
 * This is mostly written for clarity (I hope it is clear) and compatibility, 
 * not optimised for performance, and has to be tested heavily for stability. 
 * (Looking up to Java's Area path boolean algorithms for stability, 
 * but the code is too complex —mainly because the operations are stored and 
 * enumerable, such as quadraticCurveTo, cubicCurveTo etc.; and is largely 
 * undocumented to directly adapt from)
 * 
 * Supported
 *  - paperjs Path and CompoundPath objects
 *  - Boolean Union
 *  - Boolean Intersection
 *  - Boolean Subtraction
 *
 * Not supported yet ( which I would like to see supported )
 *  - Self-intersecting Paths
 *  - Paths are clones of each other that ovelap exactly on top of each other!
 *
 * In the Not-supported-yet list, the first three can be easily implemented, 
 * as for the last point, I need help! Thanks! :)
 *  
 * ------
 * Harikrishnan Gopalakrishnan
 * http://hkrish.com/playground/paperjs/booleanStudy.html
 *
 * ------
 * Paperjs
 * Copyright (c) 2011, Juerg Lehni & Jonathan Puckey
 * http://paperjs.org/license/
 * 
 */


/**
 * BooleanOps defines the boolean operator functions to use.
 * A boolean operator is a function f( link:Link, isInsidePath1:Boolean, isInsidePath2:Boolean ) :
 *  should return a Boolean value indicating whether to keep the link or not.
 *  return true - keep the path
 *  return false - discard the path
 */
 var BooleanOps = {
  Union: function( lnk, isInsidePath1, isInsidePath2 ){
    if( isInsidePath1 || isInsidePath2 ){
      return false;
    }
    return true;
  },

  Intersection: function( lnk, isInsidePath1, isInsidePath2 ){
    if( !isInsidePath1 && !isInsidePath2 ){
      return false;
    }
    return true;
  },

  // path1 - path2
  Subtraction: function( lnk, isInsidePath1, isInsidePath2 ){
    var pathid = lnk.pathId;
    if( pathid === 1 && isInsidePath2 ){
      return false;
    } else if( pathid === 2 && !isInsidePath1 ){
      return false;
    }
    return true;
  }
};

/**
 * The datastructure for boolean computation:
 *  Graph - List of Links
 *  Link  - Connects 2 Nodes, represents a Curve
 *  Node  - Connects 2 Links, represents a Segment
 */

 var NORMAL_NODE = 1;
 var INTERSECTION_NODE = 2;
 var IntersectionID = 1;
 var UNIQUE_ID = 1;

/**
 * Nodes in the graph are analogous to Segment objects
 * with additional linkage information to track intersections etc.
 * (enough to do a complete graph traversal)
 * @param {Point} _point
 * @param {Point} _handleIn
 * @param {Point} _handleOut
 * @param {Any} _id
 */
 function Node( _point, _handleIn, _handleOut, _id, isBaseContour ){
  this.id = _id;
  this.isBaseContour = isBaseContour;
  this.type = NORMAL_NODE;
  this.point   = _point;
  this.handleIn = _handleIn;  // handleIn
  this.handleOut = _handleOut;  // handleOut
  this.linkIn = null;  // aka linkIn
  this.linkOut = null;  // linkOut
  this.uniqueID = ++UNIQUE_ID;

  // In case of an intersection this will be a merged node.
  // And we need space to save the "other Node's" parameters before merging.
  this.idB = null;
  this.isBaseContourB = false;
  // this.pointB   = this.point; // point should be the same
  this.handleBIn = null;
  this.handleBOut = null;
  this.linkBIn = null;
  this.linkBOut = null;

  this._segment = null;

  this.getSegment = function( recalculate ){
    if( this.type === INTERSECTION_NODE && recalculate ){
      // point this.linkIn and this.linkOut to those active ones
      // also point this.handleIn and this.handleOut to correct in and out handles
      // If a link is null, make sure the corresponding handle is also null
      this.handleIn = (this.linkIn)? this.handleIn : null;
      this.handleOut = (this.linkOut)? this.handleOut : null;
      this.handleBIn = (this.linkBIn)? this.handleBIn : null;
      this.handleBOut = (this.linkBOut)? this.handleBOut : null;
      // Select the valid links
      this.linkIn = this.linkIn || this.linkBIn; // linkIn
      this.linkOut = this.linkOut || this.linkBOut; // linkOut
      // Also update the references in links to point to "this" Node
      this.linkIn.nodeOut = this;  // linkIn.nodeEnd
      this.linkOut.nodeIn = this;  // linkOut.nodeStart
      this.handleIn = this.handleIn || this.handleBIn;
      this.handleOut = this.handleOut || this.handleBOut;
      this.isBaseContour = this.isBaseContour | this.isBaseContourB;
    }
    this._segment = this._segment || new Segment( this.point, this.handleIn, this.handleOut );
    return this._segment;
  };
}

/**
 * Links in the graph are analogous to CUrve objects
 * @param {Node} _nodeIn
 * @param {Node} _nodeOut
 * @param {Any} _id
 */
 function Link( _nodeIn, _nodeOut, _id, isBaseContour ) {
  this.id = _id;
  this.isBaseContour = isBaseContour;
  this.nodeIn = _nodeIn;  // nodeStart
  this.nodeOut = _nodeOut;  // nodeEnd
  this.nodeIn.linkOut = this;  // nodeStart.linkOut
  this.nodeOut.linkIn = this;  // nodeEnd.linkIn
  this._curve = null;
  this.intersections = [];

  // for reusing the paperjs function we need to (temperorily) build a Curve object from this Link
  // for performance reasons we cache it.
  this.getCurve = function() {
    this._curve = this._curve || new Curve( this.nodeIn.getSegment(), this.nodeOut.getSegment() );
    return this._curve;
  };
}

/**
 * makes a graph. Only works on paths, for compound paths we need to 
 * make graphs for each of the child paths and merge them.
 * @param  {Path} path
 * @param  {Integer} id
 * @return {Array} Links
 */
 function makeGraph_old( path, id, isBaseContour ){
  var graph = [];
  var segs = path.segments, prevNode = null, firstNode = null, nuLink, nuNode;
  for( i = 0, l = segs.length; i < l; i++ ){
    var nuSeg = segs[i].clone();
    nuNode = new Node( nuSeg.point, nuSeg.handleIn, nuSeg.handleOut, id, isBaseContour );
    if( prevNode ) {
      nuLink = new Link( prevNode, nuNode, id, isBaseContour );
      graph.push( nuLink );
    }
    prevNode = nuNode;
    if( !firstNode ){
      firstNode = nuNode;
    }
  }
  // the path is closed
  nuLink = new Link( prevNode, firstNode, id, isBaseContour );
  graph.push( nuLink );
  return graph;
}

function _ensureIds( path ){
  var i, l, children;
  if( path instanceof CompoundPath ){
    children = path.children;
    for (i = 0, l = children.length; i < l; i++) {
      _makeId( children[i] );
    }
  } else {
    var segs = path.segments;
    for (i = 0, l = segs.length; i < l; i++) {
      segs[i].id = UNIQUE_ID++;
    }
    // var crvs = path.curves;
    // for (i = 0, l = crvs.length; i < l; i++) {
    //   crvs[i].id = UNIQUE_ID++;
    // }
  }
}

function _reverse( path ) {
  var i, l, children;
  if( path instanceof CompoundPath ){
    children = path.children;
    for (i = 0, l = children.length; i < l; i++) {
      children[i].reverse();
    }
  } else {
    path.reverse();
  }
}

/**
 * makes a graph for a pathItem
 * @param  {Path} path
 * @param  {Integer} id
 * @return {Array} Links
 */
function makeGraph( path ){
  _ensureIds( path );
  var curves = path.getCurves(), firstChildCount,
    isBaseContour = true, i, len, link,
    pathId = path.id;
  firstChildCount = ( path instanceof CompoundPath )? path.children[0].curves.length : path.curves.length;
  for (i = 0, len = curves.length; i < len; i++, firstChildCount--) {
    link = curves[i];
    link._pathId = pathId;
    link._baseContour = (firstChildCount > 0);
    link.segment1._curveOut = link;
    link.segment2._curveIn = link;
    link.intersections = [];
  }
  return curves;
}


/**
 * Calculates the Union of two paths
 * Boolean API.
 * @param  {Path} path1
 * @param  {Path} path2
 * @return {CompoundPath} union of path1 & path2
 */
function boolUnion( path1, path2 ){
  return computeBoolean( path1, path2, BooleanOps.Union );
}


/**
 * Calculates the Intersection between two paths
 * Boolean API.
 * @param  {Path} path1
 * @param  {Path} path2
 * @return {CompoundPath} Intersection of path1 & path2
 */
function boolIntersection( path1, path2 ){
  return computeBoolean( path1, path2, BooleanOps.Intersection );
}


/**
 * Calculates path1—path2
 * Boolean API.
 * @param  {Path} path1
 * @param  {Path} path2
 * @return {CompoundPath} path1 <minus> path2
 */
function boolSubtract( path1, path2 ){
  return computeBoolean( path1, path2, BooleanOps.Subtraction );
}


/**
 * Actual function that computes the boolean
 * @param  {Path} _path1 (cannot be self-intersecting at the moment)
 * @param  {Path} _path2 (cannot be self-intersecting at the moment)
 * @param  {BooleanOps type} operator
 * @return {CompoundPath} boolean result
 */
function computeBoolean( _path1, _path2, operator ){
  IntersectionID = 1;
  UNIQUE_ID = 1;

  // The boolean operation may modify the original paths
  var path1 = _path1.clone();
  var path2 = _path2.clone();
  path1.style = path2.style = null;
  // if( !path1.clockwise ){ path1.reverse(); }
  // if( !path2.clockwise ){ path2.reverse(); }
  // 
  var path1Id = path1.id, path2Id = path2.id;
  var i, j, k, l, crv, node, nuSeg, leftLink, rightLink;

  // Prepare the graphs. Graphs are list of Links that retains 
  // full connectivity information. The order of links in a graph is not important
  // That allows us to sort and merge graphs and 'splice' links with their splits easily.
  // Also, this is the place to resolve self-intersecting paths
  var graph = [], path1Children, path2Children, base;
  graph = makeGraph( path1 );

  // if operator === BooleanOps.Subtraction, then reverse path2
  // so that the nodes and links will link correctly
  if ( operator === BooleanOps.Subtraction ){
    _reverse( path2 );
  }

  graph = graph.concat( makeGraph( path2 ) );

  console.log( "Total curves: " + graph.length );

  window.g = graph;
  // return;

  // Sort function to sort intersections according to the 'parameter'(t) in a link (curve)
  function ixSort( a, b ){ return a.parameter - b.parameter; }

  /*
   * Pass 1:
   * Calculate the intersections for all graphs
   * TODO: test if this takes are of self intersecting paths - NO
   *    And since it doesn't take self-intersecting curves, we need to only calculate
   *    intersections if the "id" of the links differ.
   * The rest of the algorithm can easily be modified to resolve self-intersections
   */
   for ( i = graph.length - 1; i >= 0; i--) {
    var c1 = graph[i];
    var v1 = c1.getValues();
    for ( j = i -1; j >= 0; j-- ) {
      if( graph[j]._pathId === graph[i]._pathId ){ continue; }
      var c2 = graph[j];
      var v2 = c2.getValues();
      var loc = [];
      Curve._addIntersections( v1, v2, c1, loc );
      if( loc.length ){
        for (k = 0, l=loc.length; k<l; k++) {
          graph[i].intersections.push( loc[k] );
          var loc2 = new CurveLocation( c2, null, loc[k].point );
          loc2.id = loc[k].id;
          graph[j].intersections.push( loc2 );
        }
      }
    }
  }


  /*  
   * Pass 2:
   * Walk the graph, sort the intersections on each individual link.
   * for each link that intersects with another one, replace it with new split links.
   */
   for ( i = graph.length - 1; i >= 0; i--) {
    if( graph[i].intersections.length ){
      var ix = graph[i].intersections;
      // Sort the intersections if there is more than one
      if( graph[i].intersections.length > 1 ){ ix.sort( ixSort ); }
      // Remove the graph link, this link has to be split and replaced with the splits
      crv = graph.splice( i, 1 )[0];
      for (j =0, l=ix.length; j<l && crv; j++) {
        // We need to recalculate parameter after each curve split
        var param = crv.getParameterOf( ix[j].point );
        // Check if intersection falls on an existing node
        if( param === 0.0 || param === 1.0) {
          // there is no need to split the curve
          nuSeg = ( param === 0.0 )? crv.segment1 : crv.segment2;
          nuSeg._type = INTERSECTION_NODE; // This is a four-way node
          nuNode._intersectionID = ix[j].id;
          if( param === 1.0 ){
            leftLink = null;
            rightLink = crv;
          } else {
            leftLink = crv;
            rightLink = null;
          }
        } else {
          var parts = Curve.subdivide(crv.getValues(), param);
          var left = parts[0];
          var right = parts[1];
          // Make new link and convert handles from absolute to relative
          // TODO: check if link is linear and set handles to null
          var ixPoint = new Point( left[6], left[7] );
          nuSeg = new Segment( ixPoint, new Point(left[4] - ixPoint.x, left[5] - ixPoint.y),
            new Point(right[2] - ixPoint.x, right[3] - ixPoint.y) );
          nuSeg.id = UNIQUE_ID++;
          nuSeg._pathId = crv._pathId;
          nuSeg._type = INTERSECTION_NODE;
          nuSeg._intersectionID = ix[j].id;
          // clear the cached Segment on original end nodes and Update their handles
          var tmppnt = crv.segment1.point;
          crv.segment1.handleOut = new Point( left[2] - tmppnt.x, left[3] - tmppnt.y );
          tmppnt = crv.segment2.point;
          crv.segment2.handleIn = new Point( right[4] - tmppnt.x, right[5] - tmppnt.y );
          // Make new links after the split
          leftLink = Curve.create( null, crv.segment1, nuSeg );
          rightLink = Curve.create( null, nuSeg, crv.segment2 );
          leftLink.segment1._curveOut = leftLink;
          nuSeg._curveIn = leftLink;
          nuSeg._curveOut = rightLink;
          rightLink.segment2._curveIn = rightLink;
          leftLink._pathId = rightLink._pathId = crv._pathId;
          leftLink._baseContour = rightLink._baseContour = crv._baseContour;
        }
        // Add the first split link back to the graph, since we sorted the intersections
        // already, this link should contain no more intersections to the left.
        if( leftLink ){
          graph.splice( i, 0, leftLink );
        }
        // continue with the second split link, to see if 
        // there are more intersections to deal with
        crv = rightLink;
      }
      // Add the last split link back to the graph
      if( crv ){
        graph.splice( i, 0, crv );
      }
    }
  }


  /**
   * Pass 3:
   * Merge matching intersection Node Pairs (type is INTERSECTION_NODE &&
   *  a._intersectionID == b._intersectionID )
   *  
   * Mark each Link(Curve) according to whether it is 
   *  case 1. inside Path1 ( and only Path1 )
   *       2. inside Path2 ( and only Path2 )
   *       3. outside (normal case)
   *       
   * Take a test function "operator" which will discard links
   * according to the above
   *  * Union         -> discard cases 1 and 2
   *  * Intersection  -> discard case 3
   *  * Path1-Path2   -> discard cases 2, 3[Path2]
   */

  // step 1: discard invalid links according to the boolean operator
  for ( i = graph.length - 1; i >= 0; i--) {
    crv = graph[i];
    // var midPoint = new Point(lnk.nodeIn.point);
    var midPoint = crv.getPoint( 0.5 );
    var insidePath1 = (crv._pathId === path1Id )? false : path1.contains( midPoint );
    var insidePath2 = (crv._pathId === path2Id )? false : path2.contains( midPoint );
    if( !operator( crv, insidePath1, insidePath2 ) ){
      // lnk = graph.splice( i, 1 )[0];
      crv._INVALID = true;
      crv.segment1._curveOut = null;
      crv.segment2._curveIn = null;
    }
  }

  // step 2: Match nodes according to their _intersectionID and merge them together
  var len = graph.length;
  while( len-- ){
    node = graph[len].segment1;
    if( node._type === INTERSECTION_NODE ){
      var otherNode = null;
      for (i = len - 1; i >= 0; i--) {
        var tmpnode = graph[i].segment1;
        // console.log(node.id, node._intersectionID, tmpnode.id, tmpnode._intersectionID );
        if( tmpnode._intersectionID === node._intersectionID &&
         tmpnode.id !== node.id ) {
          otherNode = tmpnode;
          break;
        }
      }
      if( otherNode ) {
        console.log( node.id, otherNode.id )
        //Check if it is a self-intersecting Node
        if( node._pathId === otherNode._pathId ){
          // Swap the outgoing links, this will resolve a knot and create two paths,
          // the portion of the original path on one side of a self crossing is counter-clockwise,
          // so one of the resulting paths will also be counter-clockwise
          var tmp = otherNode._curveOut;
          otherNode._curveOut = node._curveOut;
          node._curveOut = tmp;
          tmp = otherNode.handleOut;
          otherNode.handleOut = node.handleOut;
          node.handleOut = tmp;
          node._type = otherNode._type = NORMAL_NODE;
          node._intersectionID = null;
        } else {
          // Merge the nodes together, by adding this node's information to the other node
          // otherNode._idB = node.id;
          // otherNode._baseContourB = node._baseContour;
          // otherNode._handleBIn = node.handleIn;
          // otherNode._handleBOut = node.handleOut;
          // otherNode._curveBIn = node._curveIn;
          // otherNode._curveBOut = node._curveOut;
          // if( node._curveIn ){ node._curveIn.segment2 = otherNode; }
          // if( node._curveOut ){ node._curveOut.segment1 = otherNode; }

          // Why do I have to do this again??
          node._idB = otherNode.id;
          node._baseContourB = otherNode._baseContour;
          node._handleBIn = otherNode.handleIn;
          node._handleBOut = otherNode.handleOut;
          node._curveBIn = otherNode._curveIn;
          node._curveBOut = otherNode._curveOut;
          if( otherNode._curveIn ){ otherNode._curveIn.segment2 = node; }
          if( otherNode._curveOut ){ otherNode._curveOut.segment1 = node; }

          // Clear this node's intersectionID, so that we won't iterate over it again
          // node._type = NORMAL_NODE;
          node._intersectionID = null;
        }
      }
    }
  }

  function reorient( seg ){
    console.log(seg._type, seg.id, seg)
    if( seg._type !== INTERSECTION_NODE ){
      return seg;
    }
    // point seg._curveIn and seg._curveOut to those active ones
    // also point seg.handleIn and seg.handleOut to correct in and out handles
    // If a link is null, make sure the corresponding handle is also null
    seg.handleIn = (seg._curveIn)? seg.handleIn : null;
    seg.handleOut = (seg._curveOut)? seg.handleOut : null;
    seg.handleBIn = (seg._curveBIn)? seg.handleBIn : null;
    seg.handleBOut = (seg._curveBOut)? seg.handleBOut : null;
    // Select the valid links
    seg._curveIn = seg._curveIn || seg._curveBIn; // _curveIn
    seg._curveOut = seg._curveOut || seg._curveBOut; // _curveOut
    // Also update the references in links to point to "seg" Node
    seg._curveIn.segment2 = seg;  // _curveIn.nodeEnd
    seg._curveOut.segment1 = seg;  // _curveOut.nodeStart
    seg.handleIn = seg.handleIn || seg.handleBIn;
    seg.handleOut = seg.handleOut || seg.handleBOut;
    seg._baseContour = seg._baseContour | seg._baseContourB;
    return seg;
  }

  // Final step: Retrieve the resulting paths from the graph
  var boolResult = new CompoundPath();
  var firstNode = true, nextNode, foundBasePath = false;
  while( firstNode ){
    firstNode = nextNode = null;
    len = graph.length;
    while( len-- ){
      if( !graph[len]._INVALID && !graph[len].segment1.visited && !firstNode ){
        if( !foundBasePath && graph[len]._baseContour ){
          firstNode = graph[len].segment1;
          foundBasePath = true;
          break;
        } else if(foundBasePath){
          firstNode = graph[len].segment1;
          break;
        }
      }
    }
    if( firstNode ){
      var path = new Path();
      path.add( reorient( firstNode ) );
      firstNode.visited = true;
      console.log(firstNode.point)
      nextNode = firstNode._curveOut.segment2;
      while( firstNode.id !== nextNode.id ){
        path.add( reorient( nextNode ) );
        nextNode.visited = true;
      console.log(nextNode.point)
        nextNode = nextNode._curveOut.segment2;
      }
      path.closed = true;
      // path.clockwise = true;
      boolResult.addChild( path );
    }
  }
  boolResult = boolResult.reduce();

  path1.remove();
  path2.remove();

  return boolResult;
}


function markPoint( pnt, t, c, tc, remove ) {
  if( !pnt ) return;
  c = c || '#000';
  if( remove === undefined ){ remove = true; }
  var cir = new Path.Circle( pnt, 2 );
  cir.style.fillColor = c;
  cir.style.strokeColor = tc;
  if( t !== undefined || t !== null ){
    var text = new PointText( pnt.add([0, -3]) );
    text.justification = 'center';
    text.fillColor = c;
    text.content = t;
    if( remove ){
      text.removeOnMove();
    }
  }
  if( remove ) {
    cir.removeOnMove();
  }
}

// Same as the paperjs' Numerical class, 
// added here because I can't access the original from this scope
var Numerical = {
  TOLERANCE : 10e-6
};

// paperjs' Curve._addIntersections modified to return just intersection Point with a
// unique id.
paper.Curve._addIntersections = function(v1, v2, curve, locations) {
    var bounds1 = Curve.getBounds(v1),
      bounds2 = Curve.getBounds(v2);
    if (bounds1.touches(bounds2)) {
      // See if both curves are flat enough to be treated as lines.
      if (Curve.isFlatEnough(v1, /*#=*/ Numerical.TOLERANCE) &&
       Curve.isFlatEnough(v2, /*#=*/ Numerical.TOLERANCE)) {
        // See if the parametric equations of the lines interesct.
        var point = new Line(v1[0], v1[1], v1[6], v1[7], false)
            .intersect(new Line(v2[0], v2[1], v2[6], v2[7], false),
              // Filter out beginnings of the curves, to avoid
              // duplicate solutions where curves join.
              true, false);
        if (point){
          // Passing null for parameter leads to lazy determination of
          // parameter values in CurveLocation#getParameter() only
          // once they are requested.
          var loc = new CurveLocation(curve, null, point);
          loc.id = ++UNIQUE_ID;
          locations.push( loc );
        }
      } else {
        // Subdivide both curves, and see if they intersect.
        var v1s = Curve.subdivide(v1),
          v2s = Curve.subdivide(v2);
        for (var i = 0; i < 2; i++)
          for (var j = 0; j < 2; j++)
            this._addIntersections(v1s[i], v2s[j], curve, locations);
      }
    }
    return locations;
  };
