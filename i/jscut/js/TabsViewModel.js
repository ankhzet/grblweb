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

function Tab(options, svgViewModel, tabsViewModel, tabsGroup, rawPaths, toolPathsChanged, loading) {
    "use strict";
    let self = this;
    self.rawPaths = rawPaths;
    self.enabled = ko.observable(true);
    self.margin = ko.observable("0.0");
    self.combinedGeometry = [];
    self.combinedGeometrySvg = null;

    tabsViewModel.unitConverter.addComputed(self.margin);
    self.enabled.subscribe(toolPathsChanged);

    self.removeCombinedGeometrySvg = function() {
        if (self.combinedGeometrySvg) {
            self.combinedGeometrySvg.remove();
            self.combinedGeometrySvg = null;
        }
    }

    self.enabled.subscribe(function (newValue) {
        let v;
        if (newValue)
            v = "visible";
        else
            v = "hidden";
        if (self.combinedGeometrySvg)
            self.combinedGeometrySvg.attr("visibility", v);
    });

    self.recombine = function () {
        if (loading)
            return;

        let startTime = Date.now();
        if (options.profile)
            console.log("tabs recombine...");

        self.removeCombinedGeometrySvg();

        let all = [];
        for (let i = 0; i < self.rawPaths.length; ++i) {
            let geometry = jscut.priv.path.getClipperPathsFromSnapPath(self.rawPaths[i].path, svgViewModel.pxPerInch(), function (msg) {
                showAlert(msg, "alert-warning");
            });
            if (geometry != null) {
                let fillRule;
                if (self.rawPaths[i].nonzero)
                    fillRule = ClipperLib.PolyFillType.pftNonZero;
                else
                    fillRule = ClipperLib.PolyFillType.pftEvenOdd;
                all.push(jscut.priv.path.simplifyAndClean(geometry, fillRule));
            }
        }

        if (all.length == 0)
            self.combinedGeometry = [];
        else {
            self.combinedGeometry = all[0];
            for (let i = 1; i < all.length; ++i)
                self.combinedGeometry = jscut.priv.path.clip(self.combinedGeometry, all[i], ClipperLib.ClipType.ctUnion);
        }

        let offset = self.margin.toInch() * jscut.priv.path.inchToClipperScale;
        if (offset != 0)
            self.combinedGeometry = jscut.priv.path.offset(self.combinedGeometry, offset);

        if (self.combinedGeometry.length != 0) {
            let path = jscut.priv.path.getSnapPathFromClipperPaths(self.combinedGeometry, svgViewModel.pxPerInch());
            if (path != null)
                self.combinedGeometrySvg = tabsGroup.path(path).attr("class", "tabsGeometry");
        }

        if (options.profile)
            console.log("tabs recombine: " + (Date.now() - startTime));

        self.enabled(true);
        toolPathsChanged();
    }

    self.margin.subscribe(self.recombine);
    self.recombine();

    self.toJson = function () {
        return {
            'rawPaths': self.rawPaths,
            'enabled': self.enabled(),
            'margin': self.margin(),
        };
    }

    self.fromJson = function (json) {
        function f(j, o) {
            if (typeof j !== "undefined")
                o(j);
        }

        if (json) {
            loading = true;
            self.rawPaths = json.rawPaths;
            f(json.margin, self.margin);

            loading = false;
            self.recombine();

            f(json.enabled, self.enabled);
        }
    }
}

function TabsViewModel(miscViewModel, options, svgViewModel, materialViewModel, selectionViewModel, tabsGroup, toolPathsChanged) {
    "use strict";
    let self = this;
    self.miscViewModel = miscViewModel;
    self.svgViewModel = svgViewModel;
    self.tabs = ko.observableArray();
    self.units = ko.observable(materialViewModel.matUnits());
    self.unitConverter = new UnitConverter(self.units);
    self.maxCutDepth = ko.observable(0);

    self.unitConverter.add(self.maxCutDepth);
    self.maxCutDepth.subscribe(toolPathsChanged);

    self.units.subscribe(function (newValue) {
        let tabs = self.tabs();
        if (newValue == "inch")
            for (let i = 0; i < tabs.length ; ++i) {
                let tab = tabs[i];
                tab.margin(tab.margin() / 25.4);
            }
        else
            for (let i = 0; i < tabs.length ; ++i) {
                let tab = tabs[i];
                tab.margin(tab.margin() * 25.4);
            }
    });

    svgViewModel.pxPerInch.subscribe(function () {
        let tabs = self.tabs();
        for (let i = 0; i < tabs.length; ++i)
            tabs[i].recombine();
    });

    self.addTab = function () {
        let rawPaths = [];
        selectionViewModel.getSelection().forEach(function (element) {
            rawPaths.push({
                'path': Snap.parsePathString(element.attr('d')),
                'nonzero': element.attr("fill-rule") != "evenodd",
            });
        });
        selectionViewModel.clearSelection();
        let tab = new Tab(options, svgViewModel, self, tabsGroup, rawPaths, toolPathsChanged, false);
        self.tabs.push(tab);
        toolPathsChanged();
    }

    self.removeTab = function (tab) {
        tab.removeCombinedGeometrySvg();
        let i = self.tabs.indexOf(tab);
        self.tabs.remove(tab);
        toolPathsChanged();
    }

    self.clickOnSvg = function (elem) {
        if (elem.attr("class") == "tabsGeometry")
            return true;
        return false;
    }

    self.toJson = function () {
        let tabs = self.tabs();
        let jsonTabs = [];
        for (let i = 0; i < tabs.length; ++i)
            jsonTabs.push(tabs[i].toJson());
        return {
            'units': self.units(),
            'maxCutDepth': self.maxCutDepth(),
            'tabs': jsonTabs,
        };
    }

    self.fromJson = function (json) {
        function f(j, o) {
            if (typeof j !== "undefined")
                o(j);
        }

        if (json) {
            f(json.units, self.units);
            f(json.maxCutDepth, self.maxCutDepth);

            let oldTabs = self.tabs();
            for (let i = 0; i < oldTabs.length; ++i) {
                oldTabs[i].removeCombinedGeometrySvg();
            }
            self.tabs.removeAll();

            if ((typeof json.tabs !== "undefined")) {
                for (let i = 0; i < json.tabs.length; ++i) {
                    let tab = new Tab(options, svgViewModel, self, tabsGroup, [], toolPathsChanged, true);
                    self.tabs.push(tab);
                    tab.fromJson(json.tabs[i]);
                }
            }
        }
    }
}
