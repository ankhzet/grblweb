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

function RenderPath(options, canvas, shaderDir, shadersReady) {
    "use strict";
    let self = this;

    let needToCreatePathTexture = false;
    let needToDrawHeightMap = false;
    let requestFrame;

    let gpuMem = 2 * 1024 * 1024;
    let resolution = 1024;
    let cutterDia = .125;
    let cutterAngleRad = Math.PI;
    let isVBit = false;
    let cutterH = 0;
    let pathXOffset = 0;
    let pathYOffset = 0;
    let pathScale = 1;
    let pathMinZ = -1;
    let pathTopZ = 0;
    let stopAtTime = 9999999;
    let rotate = mat4.create();

    $(canvas).resize(function () {
        needToDrawHeightMap = true;
        requestFrame();
    });

    self.gl = WebGLUtils.setupWebGL(canvas);

    function loadShader(filename, type, callback) {
        if (self.gl)
            $.get(filename, function (source) {
                let shader = self.gl.createShader(type);
                self.gl.shaderSource(shader, source);
                self.gl.compileShader(shader);
                if (self.gl.getShaderParameter(shader, self.gl.COMPILE_STATUS))
                    callback(shader);
                else
                    alert(self.gl.getShaderInfoLog(shader));
            });
    }

    let rasterizePathVertexShader;
    let rasterizePathFragmentShader;
    let rasterizePathProgram;

    function linkRasterizePathProgram() {
        rasterizePathProgram = self.gl.createProgram();
        self.gl.attachShader(rasterizePathProgram, rasterizePathVertexShader);
        self.gl.attachShader(rasterizePathProgram, rasterizePathFragmentShader);
        self.gl.linkProgram(rasterizePathProgram);

        if (!self.gl.getProgramParameter(rasterizePathProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RasterizePath shaders");
        }

        self.gl.useProgram(rasterizePathProgram);

        rasterizePathProgram.resolution = self.gl.getUniformLocation(rasterizePathProgram, "resolution");
        rasterizePathProgram.cutterDia = self.gl.getUniformLocation(rasterizePathProgram, "cutterDia");
        rasterizePathProgram.pathXYOffset = self.gl.getUniformLocation(rasterizePathProgram, "pathXYOffset");
        rasterizePathProgram.pathScale = self.gl.getUniformLocation(rasterizePathProgram, "pathScale");
        rasterizePathProgram.pathMinZ = self.gl.getUniformLocation(rasterizePathProgram, "pathMinZ");
        rasterizePathProgram.pathTopZ = self.gl.getUniformLocation(rasterizePathProgram, "pathTopZ");
        rasterizePathProgram.stopAtTime = self.gl.getUniformLocation(rasterizePathProgram, "stopAtTime");
        rasterizePathProgram.pos1 = self.gl.getAttribLocation(rasterizePathProgram, "pos1");
        rasterizePathProgram.pos2 = self.gl.getAttribLocation(rasterizePathProgram, "pos2");
        rasterizePathProgram.rawPos = self.gl.getAttribLocation(rasterizePathProgram, "rawPos");
        rasterizePathProgram.startTime = self.gl.getAttribLocation(rasterizePathProgram, "startTime");
        rasterizePathProgram.endTime = self.gl.getAttribLocation(rasterizePathProgram, "endTime");
        rasterizePathProgram.command = self.gl.getAttribLocation(rasterizePathProgram, "command");

        self.gl.useProgram(null);
    }

    let renderHeightMapVertexShader;
    let renderHeightMapFragmentShader;
    let renderHeightMapProgram;

    function linkRenderHeightMapProgram() {
        renderHeightMapProgram = self.gl.createProgram();
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapVertexShader);
        self.gl.attachShader(renderHeightMapProgram, renderHeightMapFragmentShader);
        self.gl.linkProgram(renderHeightMapProgram);

        if (!self.gl.getProgramParameter(renderHeightMapProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RenderHeightMap shaders");
        }

        self.gl.useProgram(renderHeightMapProgram);

        renderHeightMapProgram.resolution = self.gl.getUniformLocation(renderHeightMapProgram, "resolution");
        renderHeightMapProgram.pathScale = self.gl.getUniformLocation(renderHeightMapProgram, "pathScale");
        renderHeightMapProgram.pathMinZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathMinZ");
        renderHeightMapProgram.pathTopZ = self.gl.getUniformLocation(renderHeightMapProgram, "pathTopZ");
        renderHeightMapProgram.rotate = self.gl.getUniformLocation(renderHeightMapProgram, "rotate");
        renderHeightMapProgram.heightMap = self.gl.getUniformLocation(renderHeightMapProgram, "heightMap");
        renderHeightMapProgram.pos0 = self.gl.getAttribLocation(renderHeightMapProgram, "pos0");
        renderHeightMapProgram.pos1 = self.gl.getAttribLocation(renderHeightMapProgram, "pos1");
        renderHeightMapProgram.pos2 = self.gl.getAttribLocation(renderHeightMapProgram, "pos2");
        renderHeightMapProgram.thisPos = self.gl.getAttribLocation(renderHeightMapProgram, "thisPos");
        //renderHeightMapProgram.command = self.gl.getAttribLocation(renderHeightMapProgram, "command");

        self.gl.useProgram(null);
    }

    let basicVertexShader;
    let basicFragmentShader;
    let basicProgram;

    function linkBasicProgram() {
        basicProgram = self.gl.createProgram();
        self.gl.attachShader(basicProgram, basicVertexShader);
        self.gl.attachShader(basicProgram, basicFragmentShader);
        self.gl.linkProgram(basicProgram);

        if (!self.gl.getProgramParameter(basicProgram, self.gl.LINK_STATUS)) {
            alert("Could not initialise RenderHeightMap shaders");
        }

        self.gl.useProgram(basicProgram);

        basicProgram.scale = self.gl.getUniformLocation(basicProgram, "scale");
        basicProgram.translate = self.gl.getUniformLocation(basicProgram, "translate");
        basicProgram.rotate = self.gl.getUniformLocation(basicProgram, "rotate");
        basicProgram.vPos = self.gl.getAttribLocation(basicProgram, "vPos");
        basicProgram.vColor = self.gl.getAttribLocation(basicProgram, "vColor");

        self.gl.useProgram(null);
    }

    function loadedShader() {
        if (!rasterizePathVertexShader || !rasterizePathFragmentShader || !renderHeightMapVertexShader || !renderHeightMapFragmentShader ||
            !basicVertexShader || !basicFragmentShader)
            return;
        linkRasterizePathProgram();
        linkRenderHeightMapProgram();
        linkBasicProgram();
        shadersReady(self);
    }

    let pathBufferContent;
    let pathNumPoints = 0;
    let pathStride = 9;
    let pathVertexesPerLine = 18;
    let pathNumVertexes = 0;
    self.totalTime = 0;

    self.fillPathBuffer = function (path, topZ, cutterDiameter, cutterAngle, cutterHeight) {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        let startTime = Date.now();
        if (options.profile)
            console.log("fillPathBuffer...");

        pathTopZ = topZ;
        cutterDia = cutterDiameter;
        if (cutterAngle <= 0 || cutterAngle > 180)
            cutterAngle = 180;
        cutterAngleRad = cutterAngle * Math.PI / 180;
        isVBit = cutterAngle < 180;
        cutterH = cutterHeight;
        needToCreatePathTexture = true;
        requestFrame();
        let inputStride = 4;
        pathNumPoints = path.length / inputStride;
        let numHalfCircleSegments = 5;

        if (isVBit) {
            pathStride = 12;
            pathVertexesPerLine = 12 + numHalfCircleSegments * 6;
        } else {
            pathStride = 9;
            pathVertexesPerLine = 18;
        }

        pathNumVertexes = pathNumPoints * pathVertexesPerLine;
        let bufferContent = new Float32Array(pathNumPoints * pathStride * pathVertexesPerLine);
        pathBufferContent = bufferContent;

        let minX = path[0];
        let maxX = path[0];
        let minY = path[1];
        let maxY = path[1];
        let minZ = path[2];

        let time = 0;
        for (let point = 0; point < pathNumPoints; ++point) {
            let prevPoint = Math.max(point - 1, 0);
            let pointBegin = point * inputStride;
            let prevPointBegin = prevPoint * inputStride;
            let x = path[pointBegin + 0];
            let y = path[pointBegin + 1];
            let z = path[pointBegin + 2];
            let f = path[pointBegin + 3];
            let prevX = path[prevPointBegin + 0];
            let prevY = path[prevPointBegin + 1];
            let prevZ = path[prevPointBegin + 2];
            let dist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY) + (z - prevZ) * (z - prevZ));
            let beginTime = time;
            time = time + dist / f * 60;

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            minZ = Math.min(minZ, z);

            if (isVBit) {
                let coneHeight = -Math.min(z, prevZ, 0) + .1;
                let coneDia = coneHeight * 2 * Math.sin(cutterAngleRad / 2) / Math.cos(cutterAngleRad / 2);

                let rotAngle;
                if (x == prevX && y == prevY)
                    rotAngle = 0;
                else
                    rotAngle = Math.atan2(y - prevY, x - prevX);
                let xyDist = Math.sqrt((x - prevX) * (x - prevX) + (y - prevY) * (y - prevY));

                f = function (virtexIndex, command, rawX, rawY, rawZ, rotCos, rotSin, zOffset) {
                    if (typeof zOffset == 'undefined')
                        zOffset = 0;
                    let base = point * pathStride * pathVertexesPerLine + virtexIndex * pathStride;
                    bufferContent[base + 0] = prevX;
                    bufferContent[base + 1] = prevY;
                    bufferContent[base + 2] = prevZ + zOffset;
                    bufferContent[base + 3] = x;
                    bufferContent[base + 4] = y;
                    bufferContent[base + 5] = z + zOffset;
                    bufferContent[base + 6] = beginTime;
                    bufferContent[base + 7] = time;
                    bufferContent[base + 8] = command;
                    bufferContent[base + 9] = rawX * rotCos - rawY * rotSin;
                    bufferContent[base + 10] = rawY * rotCos + rawX * rotSin;
                    bufferContent[base + 11] = rawZ;
                }

                if (Math.abs(z - prevZ) >= xyDist * Math.PI / 2 * Math.cos(cutterAngleRad / 2) / Math.sin(cutterAngleRad / 2)) {
                    //console.log("plunge or retract");
                    // plunge or retract
                    let index = 0;

                    let command = prevZ < z ? 100 : 101;
                    for (let circleIndex = 0; circleIndex < numHalfCircleSegments*2; ++circleIndex) {
                        let a1 = 2 * Math.PI * circleIndex / numHalfCircleSegments/2;
                        let a2 = 2 * Math.PI * (circleIndex + 1) / numHalfCircleSegments/2;
                        f(index++, command, coneDia / 2 * Math.cos(a2), coneDia / 2 * Math.sin(a2), coneHeight, 1, 0);
                        f(index++, command, 0, 0, 0, 1, 0);
                        f(index++, command, coneDia / 2 * Math.cos(a1), coneDia / 2 * Math.sin(a1), coneHeight, 1, 0);
                    }

                    //if (index > pathVertexesPerLine)
                    //    console.log("oops...");
                    while (index < pathVertexesPerLine)
                        f(index++, 200, 0, 0, 0, 1, 0);
                } else {
                    //console.log("cut");
                    // cut
                    let planeContactAngle = Math.asin((prevZ - z) / xyDist * Math.sin(cutterAngleRad / 2) / Math.cos(cutterAngleRad / 2));
                    //console.log("\nxyDist = ", xyDist);
                    //console.log("delta z = " + (z - prevZ));
                    //console.log("planeContactAngle = " + (planeContactAngle * 180 / Math.PI));

                    let index = 0;
                    if (1) {
                        f(index++, 100, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 101, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, -coneDia / 2, coneHeight, Math.cos(rotAngle - planeContactAngle), Math.sin(rotAngle - planeContactAngle));
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 100, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                        f(index++, 100, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 101, 0, coneDia / 2, coneHeight, Math.cos(rotAngle + planeContactAngle), Math.sin(rotAngle + planeContactAngle));
                    }

                    let startAngle = rotAngle + Math.PI / 2 - planeContactAngle;
                    let endAngle = rotAngle + 3 * Math.PI / 2 + planeContactAngle;
                    for (let circleIndex = 0; circleIndex < numHalfCircleSegments; ++circleIndex) {
                        let a1 = startAngle + circleIndex / numHalfCircleSegments * (endAngle - startAngle);
                        let a2 = startAngle + (circleIndex + 1) / numHalfCircleSegments * (endAngle - startAngle);
                        //console.log("a1,a2: " + (a1 * 180 / Math.PI) + ", " + (a2 * 180 / Math.PI));

                        f(index++, 100, coneDia / 2 * Math.cos(a2), coneDia / 2 * Math.sin(a2), coneHeight, 1, 0);
                        f(index++, 100, 0, 0, 0, 1, 0);
                        f(index++, 100, coneDia / 2 * Math.cos(a1), coneDia / 2 * Math.sin(a1), coneHeight, 1, 0);
                        f(index++, 101, coneDia / 2 * Math.cos(a2 + Math.PI), coneDia / 2 * Math.sin(a2 + Math.PI), coneHeight, 1, 0);
                        f(index++, 101, 0, 0, 0, 1, 0);
                        f(index++, 101, coneDia / 2 * Math.cos(a1 + Math.PI), coneDia / 2 * Math.sin(a1 + Math.PI), coneHeight, 1, 0);
                    }

                    //if (index != pathVertexesPerLine)
                    //    console.log("oops...");
                    //while (index < pathVertexesPerLine)
                    //    f(index++, 200, 0, 0, 0, 1, 0);
                }
            } else {
                for (let virtex = 0; virtex < pathVertexesPerLine; ++virtex) {
                    let base = point * pathStride * pathVertexesPerLine + virtex * pathStride;
                    bufferContent[base + 0] = prevX;
                    bufferContent[base + 1] = prevY;
                    bufferContent[base + 2] = prevZ;
                    bufferContent[base + 3] = x;
                    bufferContent[base + 4] = y;
                    bufferContent[base + 5] = z;
                    bufferContent[base + 6] = beginTime;
                    bufferContent[base + 7] = time;
                    bufferContent[base + 8] = virtex;
                }
            }
        }
        self.totalTime = time;

        console.log("bufferContent (MB): " + bufferContent.length * 4 / 1024 / 1024);

        pathXOffset = -(minX + maxX) / 2;
        pathYOffset = -(minY + maxY) / 2;
        let size = Math.max(maxX - minX + 4 * cutterDia, maxY - minY + 4 * cutterDia);
        pathScale = 2 / size;
        pathMinZ = minZ;

        if (options.profile)
            console.log("fillPathBuffer: " + (Date.now() - startTime));

        requestFrame();
    }

    let pathBuffer;

    self.drawPath = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        if (!pathBuffer) {
            pathBuffer = self.gl.createBuffer();
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
            self.gl.bufferData(self.gl.ARRAY_BUFFER, gpuMem, self.gl.DYNAMIC_DRAW);
            self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        }

        self.gl.useProgram(rasterizePathProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.enable(self.gl.DEPTH_TEST);
        self.gl.viewport(0, 0, resolution, resolution);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.uniform1f(rasterizePathProgram.resolution, resolution);
        self.gl.uniform1f(rasterizePathProgram.cutterDia, cutterDia);
        self.gl.uniform2f(rasterizePathProgram.pathXYOffset, pathXOffset, pathYOffset);
        self.gl.uniform1f(rasterizePathProgram.pathScale, pathScale);
        self.gl.uniform1f(rasterizePathProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(rasterizePathProgram.pathTopZ, pathTopZ);
        self.gl.uniform1f(rasterizePathProgram.stopAtTime, stopAtTime);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, pathBuffer);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos1, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(rasterizePathProgram.pos2, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.startTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.endTime, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 7 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.command, 1, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(rasterizePathProgram.rawPos, 3, self.gl.FLOAT, false, pathStride * Float32Array.BYTES_PER_ELEMENT, 9 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.enableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.enableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.enableVertexAttribArray(rasterizePathProgram.command);
        if(isVBit)
            self.gl.enableVertexAttribArray(rasterizePathProgram.rawPos);

        let numTriangles = pathNumVertexes / 3;
        let lastTriangle = 0;
        let maxTriangles = Math.floor(gpuMem / pathStride / 3 / Float32Array.BYTES_PER_ELEMENT);

        while (lastTriangle < numTriangles) {
            let n = Math.min(numTriangles - lastTriangle, maxTriangles);
            let b = new Float32Array(pathBufferContent.buffer, lastTriangle * pathStride * 3 * Float32Array.BYTES_PER_ELEMENT, n * pathStride * 3);
            self.gl.bufferSubData(self.gl.ARRAY_BUFFER, 0, b);
            self.gl.drawArrays(self.gl.TRIANGLES, 0, n * 3);
            lastTriangle += n;
        }

        self.gl.disableVertexAttribArray(rasterizePathProgram.pos1);
        self.gl.disableVertexAttribArray(rasterizePathProgram.pos2);
        self.gl.disableVertexAttribArray(rasterizePathProgram.startTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.endTime);
        self.gl.disableVertexAttribArray(rasterizePathProgram.command);
        self.gl.disableVertexAttribArray(rasterizePathProgram.rawPos);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    let pathFramebuffer = null;
    let pathRgbaTexture = null;

    self.createPathTexture = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;
        if (!pathFramebuffer) {
            pathFramebuffer = self.gl.createFramebuffer();
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);

            pathRgbaTexture = self.gl.createTexture();
            self.gl.activeTexture(self.gl.TEXTURE0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);
            self.gl.texImage2D(self.gl.TEXTURE_2D, 0, self.gl.RGBA, resolution, resolution, 0, self.gl.RGBA, self.gl.UNSIGNED_BYTE, null);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MAG_FILTER, self.gl.NEAREST);
            self.gl.texParameteri(self.gl.TEXTURE_2D, self.gl.TEXTURE_MIN_FILTER, self.gl.NEAREST);
            self.gl.framebufferTexture2D(self.gl.FRAMEBUFFER, self.gl.COLOR_ATTACHMENT0, self.gl.TEXTURE_2D, pathRgbaTexture, 0);
            self.gl.bindTexture(self.gl.TEXTURE_2D, null);

            let renderbuffer = self.gl.createRenderbuffer();
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, renderbuffer);
            self.gl.renderbufferStorage(self.gl.RENDERBUFFER, self.gl.DEPTH_COMPONENT16, resolution, resolution);
            self.gl.framebufferRenderbuffer(self.gl.FRAMEBUFFER, self.gl.DEPTH_ATTACHMENT, self.gl.RENDERBUFFER, renderbuffer);
            self.gl.bindRenderbuffer(self.gl.RENDERBUFFER, null);
            
            self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
        }
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, pathFramebuffer);
        self.drawPath();
        self.gl.bindFramebuffer(self.gl.FRAMEBUFFER, null);
        needToCreatePathTexture = false;
        needToDrawHeightMap = true;
    }

    let meshBuffer;
    let meshStride = 9;
    let meshNumVertexes = 0;

    if (self.gl) {
        let numTriangles = resolution * (resolution - 1);
        meshNumVertexes = numTriangles * 3;
        let bufferContent = new Float32Array(meshNumVertexes * meshStride);
        let pos = 0;
        for (let y = 0; y < resolution - 1; ++y)
            for (let x = 0; x < resolution; ++x) {
                let left = x - 1;
                if (left < 0)
                    left = 0;
                let right = x + 1;
                if (right >= resolution)
                    right = resolution - 1;
                if (!(x & 1) ^ (y & 1))
                    for (let i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y + 1;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y + 1;
                        } else if (i == 1) {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
                else
                    for (let i = 0; i < 3; ++i) {
                        bufferContent[pos++] = left;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = right;
                        bufferContent[pos++] = y;
                        bufferContent[pos++] = x;
                        bufferContent[pos++] = y + 1;
                        if (i == 0) {
                            bufferContent[pos++] = left;
                            bufferContent[pos++] = y;
                        } else if (i == 1) {
                            bufferContent[pos++] = right;
                            bufferContent[pos++] = y;
                        }
                        else {
                            bufferContent[pos++] = x;
                            bufferContent[pos++] = y + 1;
                        }
                        bufferContent[pos++] = i;
                    }
            }

        //bufferContent = new Float32Array([
        //    1,1,126,1,64,126,    0,
        //    1,1,126,1,64,126,    1,
        //    1,1,126,1,64,126,    2,
        //]);
        //meshNumVertexes = 3;

        meshBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    }

    self.drawHeightMap = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        self.gl.useProgram(renderHeightMapProgram);
        self.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        self.gl.enable(self.gl.DEPTH_TEST);
        let canvasSize = Math.min(canvas.width, canvas.height);
        self.gl.viewport((canvas.width - canvasSize) / 2, (canvas.height - canvasSize) / 2, canvasSize, canvasSize);
        self.gl.clear(self.gl.COLOR_BUFFER_BIT | self.gl.DEPTH_BUFFER_BIT);

        self.gl.activeTexture(self.gl.TEXTURE0);
        self.gl.bindTexture(self.gl.TEXTURE_2D, pathRgbaTexture);

        self.gl.uniform1f(renderHeightMapProgram.resolution, resolution);
        self.gl.uniform1f(renderHeightMapProgram.pathScale, pathScale);
        self.gl.uniform1f(renderHeightMapProgram.pathMinZ, pathMinZ);
        self.gl.uniform1f(renderHeightMapProgram.pathTopZ, pathTopZ);
        self.gl.uniformMatrix4fv(renderHeightMapProgram.rotate, false, rotate);
        self.gl.uniform1i(renderHeightMapProgram.heightMap, 0);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, meshBuffer);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos0, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos1, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 2 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.pos2, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 4 * Float32Array.BYTES_PER_ELEMENT);
        self.gl.vertexAttribPointer(renderHeightMapProgram.thisPos, 2, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 6 * Float32Array.BYTES_PER_ELEMENT);
        //self.gl.vertexAttribPointer(renderHeightMapProgram.command, 1, self.gl.FLOAT, false, meshStride * Float32Array.BYTES_PER_ELEMENT, 8 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.enableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.enableVertexAttribArray(renderHeightMapProgram.command);

        self.gl.drawArrays(self.gl.TRIANGLES, 0, meshNumVertexes);

        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos0);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos1);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.pos2);
        self.gl.disableVertexAttribArray(renderHeightMapProgram.thisPos);
        //self.gl.disableVertexAttribArray(renderHeightMapProgram.command);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.bindTexture(self.gl.TEXTURE_2D, null);
        self.gl.useProgram(null);

        needToDrawHeightMap = false;
    }

    let cylBuffer;
    let cylStride = 6;
    let cylNumVertexes = 0;

    if (self.gl) (function () {
        let numDivisions = 40;
        let numTriangles = numDivisions * 4;
        cylNumVertexes = numTriangles * 3;
        let bufferContent = new Float32Array(cylNumVertexes * cylStride);
        let r = 0.7, g = 0.7, b = 0.0;

        let pos = 0;
        function addVertex(x, y, z) {
            bufferContent[pos++] = x;
            bufferContent[pos++] = y;
            bufferContent[pos++] = z;
            bufferContent[pos++] = r;
            bufferContent[pos++] = g;
            bufferContent[pos++] = b;
        }

        let lastX = .5 * Math.cos(0);
        let lastY = .5 * Math.sin(0);
        for (let i = 0; i < numDivisions; ++i) {
            let j = i + 1;
            if (j == numDivisions)
                j = 0;
            let x = .5 * Math.cos(j * 2 * Math.PI / numDivisions);
            let y = .5 * Math.sin(j * 2 * Math.PI / numDivisions);

            addVertex(lastX, lastY, 0);
            addVertex(x, y, 0);
            addVertex(lastX, lastY, 1);
            addVertex(x, y, 0);
            addVertex(x, y, 1);
            addVertex(lastX, lastY, 1);
            addVertex(0, 0, 0);
            addVertex(x, y, 0);
            addVertex(lastX, lastY, 0);
            addVertex(0, 0, 1);
            addVertex(lastX, lastY, 1);
            addVertex(x, y, 1);

            lastX = x;
            lastY = y;
        }

        cylBuffer = self.gl.createBuffer();
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, cylBuffer);
        self.gl.bufferData(self.gl.ARRAY_BUFFER, bufferContent, self.gl.STATIC_DRAW);
        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
    })();

    function lowerBound(data, offset, stride, begin, end, value) {
        while (begin < end) {
            let i = Math.floor((begin + end) / 2);
            if (data[offset + i * stride] < value)
                begin = i + 1;
            else
                end = i;
        };
        return end;
    }

    function mix(v0, v1, a) {
        return v0 + (v1 - v0) * a;
    }

    self.drawCutter = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram || pathNumPoints == 0)
            return;

        let i = lowerBound(pathBufferContent, 7, pathStride * pathVertexesPerLine, 0, pathNumPoints, stopAtTime);
        let x, y, z;
        if (i < pathNumPoints) {
            let offset = i * pathStride * pathVertexesPerLine;
            let beginTime = pathBufferContent[offset + 6];
            let endTime = pathBufferContent[offset + 7];
            let ratio;
            if (endTime == beginTime)
                ratio = 0;
            else
                ratio = (stopAtTime - beginTime) / (endTime - beginTime);
            x = mix(pathBufferContent[offset + 0], pathBufferContent[offset + 3], ratio);
            y = mix(pathBufferContent[offset + 1], pathBufferContent[offset + 4], ratio);
            z = mix(pathBufferContent[offset + 2], pathBufferContent[offset + 5], ratio);
        }
        else {
            let offset = (i-1) * pathStride * pathVertexesPerLine;
            x = pathBufferContent[offset + 3];
            y = pathBufferContent[offset + 4];
            z = pathBufferContent[offset + 5];
        }

        self.gl.useProgram(basicProgram);

        self.gl.uniform3f(basicProgram.scale, cutterDia * pathScale, cutterDia * pathScale, cutterH * pathScale);
        self.gl.uniform3f(basicProgram.translate, (x + pathXOffset) * pathScale, (y + pathYOffset) * pathScale, (z - pathTopZ) * pathScale);
        self.gl.uniformMatrix4fv(basicProgram.rotate, false, rotate);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, cylBuffer);
        self.gl.vertexAttribPointer(basicProgram.vPos, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 0);
        self.gl.vertexAttribPointer(basicProgram.vColor, 3, self.gl.FLOAT, false, cylStride * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);

        self.gl.enableVertexAttribArray(basicProgram.vPos);
        self.gl.enableVertexAttribArray(basicProgram.vColor);

        self.gl.drawArrays(self.gl.TRIANGLES, 0, cylNumVertexes);

        self.gl.disableVertexAttribArray(basicProgram.vPos);
        self.gl.disableVertexAttribArray(basicProgram.vColor);

        self.gl.bindBuffer(self.gl.ARRAY_BUFFER, null);
        self.gl.useProgram(null);
    }

    let pendingRequest = false;
    requestFrame = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;
        if (!pendingRequest) {
            window.requestAnimFrame(self.render, canvas);
            pendingRequest = true;
        }
    }

    self.render = function () {
        if (!rasterizePathProgram || !renderHeightMapProgram || !basicProgram)
            return;

        pendingRequest = true;
        if (needToCreatePathTexture)
            self.createPathTexture();
        if (needToDrawHeightMap) {
            self.drawHeightMap();
            self.drawCutter();
        }
        pendingRequest = false;

        //needToCreatePathTexture = true;
        //needToDrawHeightMap = true;
        //stopAtTime += .2;
        //requestFrame();
    }

    self.getStopAtTime = function () {
        return stopAtTime;
    }

    self.setStopAtTime = function (t) {
        stopAtTime = t;
        needToCreatePathTexture = true;
        requestFrame();
    }

    self.getRotate = function () {
        return rotate;
    }

    self.setRotate = function (rot) {
        rotate = rot;
        needToDrawHeightMap = true;
        requestFrame();
    }

    if (self.gl) {
        loadShader(shaderDir + "/rasterizePathVertexShader.txt", self.gl.VERTEX_SHADER, function (shader) {
            rasterizePathVertexShader = shader;
            loadedShader();
        });

        loadShader(shaderDir + "/rasterizePathFragmentShader.txt", self.gl.FRAGMENT_SHADER, function (shader) {
            rasterizePathFragmentShader = shader;
            loadedShader();
        });

        loadShader(shaderDir + "/renderHeightMapVertexShader.txt", self.gl.VERTEX_SHADER, function (shader) {
            renderHeightMapVertexShader = shader;
            loadedShader();
        });

        loadShader(shaderDir + "/renderHeightMapFragmentShader.txt", self.gl.FRAGMENT_SHADER, function (shader) {
            renderHeightMapFragmentShader = shader;
            loadedShader();
        });

        loadShader(shaderDir + "/basicVertexShader.txt", self.gl.VERTEX_SHADER, function (shader) {
            basicVertexShader = shader;
            loadedShader();
        });

        loadShader(shaderDir + "/basicFragmentShader.txt", self.gl.FRAGMENT_SHADER, function (shader) {
            basicFragmentShader = shader;
            loadedShader();
        });
    }
}

function startRenderPath(options, canvas, timeSliderElement, shaderDir, ready) {
    let renderPath;
    let timeSlider;

    if (timeSliderElement)
        timeSlider = timeSliderElement.slider({
            formater: function (value) {
                if (renderPath)
                    return 'Time: ' + Math.round(value / 1000 * renderPath.totalTime) + 's';
                else
                    return value;
            }
        });

    renderPath = new RenderPath(options, canvas, shaderDir, function (renderPath) {
        renderPath.fillPathBuffer([], 0, 0, 180, 0);

        let mouseDown = false;
        let lastX = 0;
        let lastY = 0;

        let origRotate = mat4.create();
        $(canvas).mousedown(function (e) {
            e.preventDefault();
            mouseDown = true;
            lastX = e.pageX;
            lastY = e.pageY;
            mat4.copy(origRotate, renderPath.getRotate());
        });

        $(document).mousemove(function (e) {
            if (!mouseDown)
                return;
            let m = mat4.create();
            mat4.rotate(m, m, Math.sqrt((e.pageX - lastX) * (e.pageX - lastX) + (e.pageY - lastY) * (e.pageY - lastY)) / 100, [e.pageY - lastY, e.pageX - lastX, 0]);
            mat4.multiply(m, m, origRotate);
            renderPath.setRotate(m);
        });

        $(document).mouseup(function (e) {
            mouseDown = false;
        });

        if (timeSlider)
            timeSlider.on('slide', function () {
                renderPath.setStopAtTime(timeSlider.val() / 1000 * renderPath.totalTime);
            });

        ready(renderPath);
    });

    return renderPath;
}

function startRenderPathDemo() {
    let renderPath;
    renderPath = startRenderPath({}, $("#renderPathCanvas")[0], $('#timeSlider'), 'js', function (renderPath) {
        $.get("logo-gcode.txt", function (gcode) {
            renderPath.fillPathBuffer(jscut.parseGcode({}, gcode), 0, .125, 180, 1);
        });
    });
}
