// Copyright 2014 Todd Fleming
//
// This file is part of jscut.
//
// jscut is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// jscut is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with jscut.  If not, see <http://www.gnu.org/licenses/>.

let jscut = jscut || {};
jscut.priv = jscut.priv || {};
jscut.priv.cam = jscut.priv.cam || {};

(function () {
    "use strict";

    function dist(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    }

    // Does the line from p1 to p2 cross outside of bounds?
    function crosses(bounds, p1, p2) {
        if (bounds == null)
            return true;
        if (p1.X == p2.X && p1.Y == p2.Y)
            return false;
        let clipper = new ClipperLib.Clipper();
        clipper.AddPath([p1, p2], ClipperLib.PolyType.ptSubject, false);
        clipper.AddPaths(bounds, ClipperLib.PolyType.ptClip, true);
        let result = new ClipperLib.PolyTree();
        clipper.Execute(ClipperLib.ClipType.ctIntersection, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
        if (result.ChildCount() == 1) {
            let child = result.Childs()[0];
            let points = child.Contour();
            if (points.length == 2) {
                if (points[0].X == p1.X && points[1].X == p2.X && points[0].Y == p1.Y && points[1].Y == p2.Y)
                    return false;
                if (points[0].X == p2.X && points[1].X == p1.X && points[0].Y == p2.Y && points[1].Y == p1.Y)
                    return false;
            }
        }
        return true;
    }

    // CamPath has this format: {
    //      path:               Clipper path
    //      safeToClose:        Is it safe to close the path without retracting?
    // }

    // Try to merge paths. A merged path doesn't cross outside of bounds. Returns array of CamPath.
    function mergePaths(bounds, paths) {
        if (paths.length == 0)
            return null;

        let currentPath = paths[0];
        currentPath.push(currentPath[0]);
        let currentPoint = currentPath[currentPath.length - 1];
        paths[0] = [];

        let mergedPaths = [];
        let numLeft = paths.length - 1;
        while (numLeft > 0) {
            let closestPathIndex = null;
            let closestPointIndex = null;
            let closestPointDist = null;
            let path;

            for (let pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
                path = paths[pathIndex];
                for (let pointIndex = 0; pointIndex < path.length; ++pointIndex) {
                    let point = path[pointIndex];
                    let dist = (currentPoint.X - point.X) * (currentPoint.X - point.X) + (currentPoint.Y - point.Y) * (currentPoint.Y - point.Y);
                    if (closestPointDist == null || dist < closestPointDist) {
                        closestPathIndex = pathIndex;
                        closestPointIndex = pointIndex;
                        closestPointDist = dist;
                    }
                }
            }

            path = paths[closestPathIndex];
            paths[closestPathIndex] = [];
            numLeft -= 1;
            let needNew = crosses(bounds, currentPoint, path[closestPointIndex]);
            path = path.slice(closestPointIndex, path.length).concat(path.slice(0, closestPointIndex));
            path.push(path[0]);
            if (needNew) {
                mergedPaths.push(currentPath);
                currentPath = path;
                currentPoint = currentPath[currentPath.length - 1];
            }
            else {
                currentPath = currentPath.concat(path);
                currentPoint = currentPath[currentPath.length - 1];
            }
        }
        mergedPaths.push(currentPath);

        let camPaths = [];
        for (let i = 0; i < mergedPaths.length; ++i) {
            let path = mergedPaths[i];
            camPaths.push({
                path: path,
                safeToClose: !crosses(bounds, path[0], path[path.length - 1])
            });
        }

        return camPaths;
    }

    // Compute paths for pocket operation on Clipper geometry. Returns array
    // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
    jscut.priv.cam.pocket = function (geometry, cutterDia, overlap, climb) {
        let current = jscut.priv.path.offset(geometry, -cutterDia / 2);
        let bounds = current.slice(0);
        let allPaths = [];
        while (current.length != 0) {
            if (climb)
                for (let i = 0; i < current.length; ++i)
                    current[i].reverse();
            allPaths = current.concat(allPaths);
            current = jscut.priv.path.offset(current, -cutterDia * (1 - overlap));
        }
        return mergePaths(bounds, allPaths);
    };

    // Compute paths for pocket operation on Clipper geometry. Returns array
    // of CamPath. cutterDia is in Clipper units. overlap is in the range [0, 1).
    jscut.priv.cam.hspocket = function (geometry, cutterDia, overlap, climb) {
        "use strict";

        let memoryBlocks = [];

        let cGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, geometry);

        let resultPathsRef = Module._malloc(4);
        let resultNumPathsRef = Module._malloc(4);
        let resultPathSizesRef = Module._malloc(4);
        memoryBlocks.push(resultPathsRef);
        memoryBlocks.push(resultNumPathsRef);
        memoryBlocks.push(resultPathSizesRef);

        //extern "C" void hspocket(
        //    double** paths, int numPaths, int* pathSizes, double cutterDia,
        //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
        Module.ccall(
            'hspocket',
            'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [cGeometry[0], cGeometry[1], cGeometry[2], cutterDia, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

        let result = jscut.priv.path.convertPathsFromCppToCamPath(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

        for (let i = 0; i < memoryBlocks.length; ++i)
            Module._free(memoryBlocks[i]);

        return result;
    };

    // Compute paths for outline operation on Clipper geometry. Returns array
    // of CamPath. cutterDia and width are in Clipper units. overlap is in the 
    // range [0, 1).
    jscut.priv.cam.outline = function (geometry, cutterDia, isInside, width, overlap, climb) {
        let currentWidth = cutterDia;
        let allPaths = [];
        let eachWidth = cutterDia * (1 - overlap);

        let current;
        let bounds;
        let eachOffset;
        let needReverse;

        if (isInside) {
            current = jscut.priv.path.offset(geometry, -cutterDia / 2);
            bounds = jscut.priv.path.diff(current, jscut.priv.path.offset(geometry, -(width - cutterDia / 2)));
            eachOffset = -eachWidth;
            needReverse = climb;
        } else {
            current = jscut.priv.path.offset(geometry, cutterDia / 2);
            bounds = jscut.priv.path.diff(jscut.priv.path.offset(geometry, width - cutterDia / 2), current);
            eachOffset = eachWidth;
            needReverse = !climb;
        }

        while (currentWidth <= width) {
            if (needReverse)
                for (let i = 0; i < current.length; ++i)
                    current[i].reverse();
            allPaths = current.concat(allPaths);
            let nextWidth = currentWidth + eachWidth;
            if (nextWidth > width && width - currentWidth > 0) {
                current = jscut.priv.path.offset(current, width - currentWidth);
                if (needReverse)
                    for (let i = 0; i < current.length; ++i)
                        current[i].reverse();
                allPaths = current.concat(allPaths);
                break;
            }
            currentWidth = nextWidth;
            current = jscut.priv.path.offset(current, eachOffset);
        }
        return mergePaths(bounds, allPaths);
    };

    // Compute paths for engrave operation on Clipper geometry. Returns array
    // of CamPath.
    jscut.priv.cam.engrave = function (geometry, climb) {
        let allPaths = [];
        for (let i = 0; i < geometry.length; ++i) {
            let path = geometry[i].slice(0);
            if (!climb)
                path.reverse();
            path.push(path[0]);
            allPaths.push(path);
        }
        let result = mergePaths(null, allPaths);
        for (let i = 0; i < result.length; ++i)
            result[i].safeToClose = true;
        return result;
    };

    jscut.priv.cam.vPocket = function (geometry, cutterAngle, passDepth, maxDepth) {
        "use strict";

        if (cutterAngle <= 0 || cutterAngle >= 180)
            return [];

        let memoryBlocks = [];

        let cGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, geometry);

        let resultPathsRef = Module._malloc(4);
        let resultNumPathsRef = Module._malloc(4);
        let resultPathSizesRef = Module._malloc(4);
        memoryBlocks.push(resultPathsRef);
        memoryBlocks.push(resultNumPathsRef);
        memoryBlocks.push(resultPathSizesRef);

        //extern "C" void vPocket(
        //    int debugArg0, int debugArg1,
        //    double** paths, int numPaths, int* pathSizes,
        //    double cutterAngle, double passDepth, double maxDepth,
        //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
        Module.ccall(
            'vPocket',
            'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [miscViewModel.debugArg0(), miscViewModel.debugArg1(), cGeometry[0], cGeometry[1], cGeometry[2], cutterAngle, passDepth, maxDepth, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

        let result = jscut.priv.path.convertPathsFromCppToCamPath(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

        for (let i = 0; i < memoryBlocks.length; ++i)
            Module._free(memoryBlocks[i]);

        return result;
    };

    // Convert array of CamPath to array of Clipper path
    jscut.priv.cam.getClipperPathsFromCamPaths = function (paths) {
        let result = [];
        if (paths != null)
            for (let i = 0; i < paths.length; ++i)
                result.push(paths[i].path);
        return result;
    }

    let displayedCppTabError1 = false;
    let displayedCppTabError2 = false;

    function separateTabs(cutterPath, tabGeometry) {
        "use strict";

        if (tabGeometry.length == 0)
            return [cutterPath];
        if (typeof Module == 'undefined') {
            if (!displayedCppTabError1) {
                showAlert("Failed to load cam-cpp.js; tabs will be missing. This message will not repeat.", "alert-danger", false);
                displayedCppTabError1 = true;
            }
            return cutterPath;
        }

        let memoryBlocks = [];

        let cCutterPath = jscut.priv.path.convertPathsToCpp(memoryBlocks, [cutterPath]);
        let cTabGeometry = jscut.priv.path.convertPathsToCpp(memoryBlocks, tabGeometry);

        let errorRef = Module._malloc(4);
        let resultPathsRef = Module._malloc(4);
        let resultNumPathsRef = Module._malloc(4);
        let resultPathSizesRef = Module._malloc(4);
        memoryBlocks.push(errorRef);
        memoryBlocks.push(resultPathsRef);
        memoryBlocks.push(resultNumPathsRef);
        memoryBlocks.push(resultPathSizesRef);

        //extern "C" void separateTabs(
        //    double** pathPolygons, int numPaths, int* pathSizes,
        //    double** tabPolygons, int numTabPolygons, int* tabPolygonSizes,
        //    bool& error,
        //    double**& resultPaths, int& resultNumPaths, int*& resultPathSizes)
        Module.ccall(
            'separateTabs',
            'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
            [cCutterPath[0], cCutterPath[1], cCutterPath[2], cTabGeometry[0], cTabGeometry[1], cTabGeometry[2], errorRef, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);

        if (Module.HEAPU32[errorRef >> 2] && !displayedCppTabError2) {
            showAlert("Internal error processing tabs; tabs will be missing. This message will not repeat.", "alert-danger", false);
            displayedCppTabError2 = true;
        }

        let result = jscut.priv.path.convertPathsFromCpp(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);

        for (let i = 0; i < memoryBlocks.length; ++i)
            Module._free(memoryBlocks[i]);

        return result;
    }

    // Convert paths to gcode. getGcode() assumes that the current Z position is at safeZ.
    // getGcode()'s gcode returns Z to this position at the end.
    // namedArgs must have:
    //      paths:          Array of CamPath
    //      ramp:           Ramp these paths?
    //      scale:          Factor to convert Clipper units to gcode units
    //      useZ:           Use Z coordinates in paths? (optional, defaults to false)
    //      offsetX:        Offset X (gcode units)
    //      offsetY:        Offset Y (gcode units)
    //      decimal:        Number of decimal places to keep in gcode
    //      topZ:           Top of area to cut (gcode units)
    //      botZ:           Bottom of area to cut (gcode units)
    //      safeZ:          Z position to safely move over uncut areas (gcode units)
    //      passDepth:      Cut depth for each pass (gcode units)
    //      plungeFeed:     Feedrate to plunge cutter (gcode units)
    //      retractFeed:    Feedrate to retract cutter (gcode units)
    //      cutFeed:        Feedrate for horizontal cuts (gcode units)
    //      rapidFeed:      Feedrate for rapid moves (gcode units)
    //      tabGeometry:    Tab geometry (optional)
    //      tabZ:           Z position over tabs (required if tabGeometry is not empty) (gcode units)
    jscut.priv.cam.getGcode = function (namedArgs) {
        let paths = namedArgs.paths;
        let ramp = namedArgs.ramp;
        let scale = namedArgs.scale;
        let useZ = namedArgs.useZ;
        let offsetX = namedArgs.offsetX;
        let offsetY = namedArgs.offsetY;
        let decimal = namedArgs.decimal;
        let topZ = namedArgs.topZ;
        let botZ = namedArgs.botZ;
        let safeZ = namedArgs.safeZ;
        let passDepth = namedArgs.passDepth;
        let plungeFeedGcode = ' F' + namedArgs.plungeFeed;
        let retractFeedGcode = ' F' + namedArgs.retractFeed;
        let cutFeedGcode = ' F' + namedArgs.cutFeed;
        let rapidFeedGcode = ' F' + namedArgs.rapidFeed;
        let tabGeometry = namedArgs.tabGeometry;
        let tabZ = namedArgs.tabZ;

        if (typeof useZ == 'undefined')
            useZ = false;

        if (typeof tabGeometry == 'undefined' || tabZ <= botZ) {
            tabGeometry = [];
            tabZ = botZ;
        }

        let gcode = "";

        let retractGcode =
            '; Retract\r\n' +
            'G1 Z' + safeZ.toFixed(decimal) + rapidFeedGcode + '\r\n';

        let retractForTabGcode =
            '; Retract for tab\r\n' +
            'G1 Z' + tabZ.toFixed(decimal) + rapidFeedGcode + '\r\n';

        function getX(p) {
            return p.X * scale + offsetX;
        }

        function getY(p) {
            return -p.Y * scale + offsetY;
        }

        function convertPoint(p) {
            let result = ' X' + (p.X * scale + offsetX).toFixed(decimal) + ' Y' + (-p.Y * scale + offsetY).toFixed(decimal);
            if (useZ)
                result += ' Z' + (p.Z * scale + topZ).toFixed(decimal);
            return result;
        }

        for (let pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
            let path = paths[pathIndex];
            let origPath = path.path;
            if (origPath.length == 0)
                continue;
            let separatedPaths = separateTabs(origPath, tabGeometry);

            gcode +=
                '\r\n' +
                '; Path ' + pathIndex + '\r\n';

            let currentZ = safeZ;
            let finishedZ = topZ;
            while (finishedZ > botZ) {
                let nextZ = Math.max(finishedZ - passDepth, botZ);
                if (currentZ < safeZ && (!path.safeToClose || tabGeometry.length > 0)) {
                    gcode += retractGcode;
                    currentZ = safeZ;
                }

                if (tabGeometry.length == 0)
                    currentZ = finishedZ;
                else
                    currentZ = Math.max(finishedZ, tabZ);
                gcode +=
                    '; Rapid to initial position\r\n' +
                    'G1' + convertPoint(origPath[0]) + rapidFeedGcode + '\r\n' +
                    'G1 Z' + currentZ.toFixed(decimal) + '\r\n';

                let selectedPaths;
                if (nextZ >= tabZ || useZ)
                    selectedPaths = [origPath];
                else
                    selectedPaths = separatedPaths;

                for (let selectedIndex = 0; selectedIndex < selectedPaths.length; ++selectedIndex) {
                    let selectedPath = selectedPaths[selectedIndex];
                    if (selectedPath.length == 0)
                        continue;

                    if (!useZ) {
                        let selectedZ;
                        if (selectedIndex & 1)
                            selectedZ = tabZ;
                        else
                            selectedZ = nextZ;

                        if (selectedZ < currentZ) {
                            let executedRamp = false;
                            if (ramp) {
                                let minPlungeTime = (currentZ - selectedZ) / namedArgs.plungeFeed;
                                let idealDist = namedArgs.cutFeed * minPlungeTime;
                                let end;
                                let totalDist = 0;
                                for (end = 1; end < selectedPath.length; ++end) {
                                    if (totalDist > idealDist)
                                        break;
                                    totalDist += 2 * dist(getX(selectedPath[end - 1]), getY(selectedPath[end - 1]), getX(selectedPath[end]), getY(selectedPath[end]));
                                }
                                if (totalDist > 0) {
                                    gcode += '; ramp\r\n'
                                    executedRamp = true;
                                    let rampPath = selectedPath.slice(0, end).concat(selectedPath.slice(0, end - 1).reverse());
                                    let distTravelled = 0;
                                    for (let i = 1; i < rampPath.length; ++i) {
                                        distTravelled += dist(getX(rampPath[i - 1]), getY(rampPath[i - 1]), getX(rampPath[i]), getY(rampPath[i]));
                                        let newZ = currentZ + distTravelled / totalDist * (selectedZ - currentZ);
                                        gcode += 'G1' + convertPoint(rampPath[i]) + ' Z' + newZ.toFixed(decimal);
                                        if (i == 1)
                                            gcode += ' F' + Math.min(totalDist / minPlungeTime, namedArgs.cutFeed).toFixed(decimal) + '\r\n';
                                        else
                                            gcode += '\r\n';
                                    }
                                }
                            }
                            if (!executedRamp)
                                gcode +=
                                    '; plunge\r\n' +
                                    'G1 Z' + selectedZ.toFixed(decimal) + plungeFeedGcode + '\r\n';
                        } else if (selectedZ > currentZ) {
                            gcode += retractForTabGcode;
                        }
                        currentZ = selectedZ;
                    } // !useZ

                    gcode += '; cut\r\n';

                    for (let i = 1; i < selectedPath.length; ++i) {
                        gcode += 'G1' + convertPoint(selectedPath[i]);
                        if (i == 1)
                            gcode += cutFeedGcode + '\r\n';
                        else
                            gcode += '\r\n';
                    }
                } // selectedIndex
                finishedZ = nextZ;
                if (useZ)
                    break;
            } // while (finishedZ > botZ)
            gcode += retractGcode;
        } // pathIndex

        return gcode;
    };
})();
