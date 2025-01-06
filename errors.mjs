export const CODES = {
    1: ['Expected Command Letter', 'G-code words consist of a letter and a value. Letter was not found.'],
    2: ['Bad Number Format', 'Missing the expected G-code word value or numeric value format is not valid'],
    3: ['Invalid Statement', 'Grbl ‘$’ system command was not recognized or supported.'],
    4: ['Value < 0', 'Negative value received for an expected positive value.'],
    5: ['Homing Disabled', 'Homing cycle failure. Homing is not enabled via settings.'],
    7: ['EEPROM Read Fail', 'An EEPROM read failed. Auto-restoring affected EEPROM to default values.'],
    8: ['Not Idle', 'Grbl ‘$’ command cannot be used unless Grbl is IDLE. Ensures smooth operation during a job.'],
    9: ['G-Code Lock', 'G-code commands are locked out during alarm or jog state.'],
    10: ['Homing Not Enabled', 'Soft limits cannot be enabled without homing also enabled.'],
    11: ['Line Overflow', 'Max characters per line exceeded. File most likely formatted improperly'],
    14: ['Line Length Exceeded', 'Build info or startup line exceeded EEPROM line length limit. Line not stored.'],
    15: ['Travel Exceeded', 'Jog target exceeds machine travel. Jog command has been ignored.'],
    17: ['Setting Disabled', 'Laser mode requires PWM output.'],
    20: ['Unsupported Command', 'Unsupported or invalid g-code command found in block. This usually means that you used the wrong Post-Processor to make your file, or that some incompatible code within needs to be manually deleted.'],
    21: ['Modal Group Violation', 'More than one g-code command from same modal group found in block.'],
    22: ['Undefined Feed Rate', 'Feed rate has not yet been set or is undefined.'],
    23: ['Invalid G-code', 'A G or M command value in the block is not an integer. For example, G4 can\'t be G4.13. Some G-code commands are floating point (G92.1), but these are ignored.'],
    24: ['Invalid G-code', 'Two G-code commands that both require the use of the XYZ axis words were detected in the block.'],
    25: ['Invalid G-code', 'A G-code word was repeated in the block.'],
    26: ['Invalid G-code', 'A G-code command implicitly or explicitly requires XYZ axis words in the block, but none were detected.'],
    27: ['Invalid G-code', 'The G-code protocol mandates N line numbers to be within the range of 1-99,999. We think that\'s a bit silly and arbitrary. So, we increased the max number to 9,999,999. This error occurs when you send a number more than this.'],
    28: ['Invalid G-code', 'A G-code command was sent, but is missing some important P or L value words in the line. Without them, the command can\'t be executed. Check your G-code.'],
    29: ['Invalid G-code', 'Grbl supports six work coordinate systems G54-G59. This error happens when trying to use or configure an unsupported work coordinate system, such as G59.1, G59.2, and G59.3.'],
    30: ['Invalid G-code', 'The G53 G-code command requires either a G0 seek or G1 feed motion mode to be active. A different motion was active.'],
    31: ['Invalid G-code', 'There are unused axis words in the block and G80 motion mode cancel is active.'],
    32: ['Invalid G-code', 'A G2 or G3 arc was commanded but there are no XYZ axis words in the selected plane to trace the arc.'],
    33: ['Invalid G-code', 'The motion command has an invalid target. G2, G3, and G38.2 generates this error. For both probing and arcs traced with the radius definition, the current position cannot be the same as the target. This also errors when the arc is mathematically impossible to trace, where the current position, the target position, and the radius of the arc doesn\'t define a valid arc.'],
    34: ['Invalid G-code', 'A G2 or G3 arc, traced with the radius definition, had a mathematical error when computing the arc geometry. Try either breaking up the arc into semi-circles or quadrants, or redefine them with the arc offset definition.'],
    35: ['Invalid G-code', 'A G2 or G3 arc, traced with the offset definition, is missing the IJK offset word in the selected plane to trace the arc.'],
    36: ['Invalid G-code', 'There are unused, leftover G-code words that aren\'t used by any command in the block.'],
    37: ['Invalid G-code', 'The G43.1 dynamic tool length offset command cannot apply an offset to an axis other than its configured axis. The Grbl default axis is the Z-axis.'],
};

export const getError = (code) => {
    const [name, help] = CODES[code] || [`Invalid G-code`, `Google "GRBL Error Code ${code}"`];

    return {
        code,
        name,
        help: `${help} (errno: ${code})`,
    };
};
