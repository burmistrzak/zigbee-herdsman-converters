import {
    identify, light, onOff, quirkCheckinInterval,
    deviceAddCustomCluster, binary, numeric, enumLookup,
    battery, humidity, iasZoneAlarm, bindCluster,
    ota, deviceEndpoints,
} from '../lib/modernExtend';
import {boschModernExtend} from '../lib/bosch';
import {Zcl, ZSpec} from 'zigbee-herdsman';
import * as exposes from '../lib/exposes';
import fz from '../converters/fromZigbee';
import tz from '../converters/toZigbee';
import * as reporting from '../lib/reporting';
import * as utils from '../lib/utils';
import * as constants from '../lib/constants';
import * as globalStore from '../lib/store';
import {
    Tz, Fz, Definition, KeyValue, ModernExtend, Expose,
} from '../lib/types';
import {logger} from '../lib/logger';
const e = exposes.presets;
const ea = exposes.access;

const NS = 'zhc:bosch';
const manufacturerOptions = {manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH};

const sirenVolume = {
    'low': 0x01,
    'medium': 0x02,
    'high': 0x03,
};

const sirenLight = {
    'only_light': 0x00,
    'only_siren': 0x01,
    'siren_and_light': 0x02,
};

const outdoorSirenState = {
    'ON': 0x07,
    'OFF': 0x00,
};

const sirenPowerSupply = {
    'solar_panel': 0x01,
    'ac_power_supply': 0x02,
    'dc_power_supply': 0x03,
};

// Universal Switch II
const buttonMap: {[key: string]: number} = {
    config_led_top_left_press: 0x10,
    config_led_top_right_press: 0x11,
    config_led_bottom_left_press: 0x12,
    config_led_bottom_right_press: 0x13,
    config_led_top_left_longpress: 0x20,
    config_led_top_right_longpress: 0x21,
    config_led_bottom_left_longpress: 0x22,
    config_led_bottom_right_longpress: 0x23,
};

// Universal Switch II
const labelShortPress = `Specifies LED color (rgb) and pattern on short press as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: ff1493000104010001`;

// Universal Switch II
const labelLongPress = `Specifies LED color (rgb) and pattern on long press as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: ff4200000502050001`;

// Universal Switch II
const labelConfirmation = `Specifies LED color (rgb) and pattern of the confirmation response as hex string.
0-2: RGB value (e.g. ffffff = white)
3: Light position (01=top, 02=bottom, 00=full)
4-7: Durations for sequence fade-in -> on -> fade-out -> off (e.g. 01020102)
8: Number of Repetitions (01=1 to ff=255)
Example: 30ff00000102010001`;

const tzLocal = {
    rbshoszbeu: {
        key: ['light_delay', 'siren_delay', 'light_duration', 'siren_duration', 'siren_volume', 'alarm_state', 'power_source', 'siren_and_light'],
        convertSet: async (entity, key, value, meta) => {
            if (key === 'light_delay') {
                const index = value;
                await entity.write(0x0502, {0xa004: {value: index, type: 0x21}}, manufacturerOptions);
                return {state: {light_delay: value}};
            }
            if (key === 'siren_delay') {
                const index = value;
                await entity.write(0x0502, {0xa003: {value: index, type: 0x21}}, manufacturerOptions);
                return {state: {siren_delay: value}};
            }
            if (key === 'light_duration') {
                const index = value;
                await entity.write(0x0502, {0xa005: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {light_duration: value}};
            }
            if (key === 'siren_duration') {
                const index = value;
                await entity.write(0x0502, {0xa000: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_duration: value}};
            }
            if (key === 'siren_and_light') {
                const index = utils.getFromLookup(value, sirenLight);
                await entity.write(0x0502, {0xa001: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_and_light: value}};
            }
            if (key === 'siren_volume') {
                const index = utils.getFromLookup(value, sirenVolume);
                await entity.write(0x0502, {0xa002: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {siren_volume: value}};
            }
            if (key === 'power_source') {
                const index = utils.getFromLookup(value, sirenPowerSupply);
                await entity.write(0x0001, {0xa002: {value: index, type: 0x20}}, manufacturerOptions);
                return {state: {power_source: value}};
            }
            if (key === 'alarm_state') {
                const endpoint = meta.device.getEndpoint(1);
                const index = utils.getFromLookup(value, outdoorSirenState);
                if (index == 0) {
                    await endpoint.command(0x0502, 0xf0, {data: 0}, manufacturerOptions);
                    return {state: {alarm_state: value}};
                } else {
                    await endpoint.command(0x0502, 0xf0, {data: 7}, manufacturerOptions);
                    return {state: {alarm_state: value}};
                }
            }
        },
        convertGet: async (entity, key, meta) => {
            switch (key) {
            case 'light_delay':
                await entity.read(0x0502, [0xa004], manufacturerOptions);
                break;
            case 'siren_delay':
                await entity.read(0x0502, [0xa003], manufacturerOptions);
                break;
            case 'light_duration':
                await entity.read(0x0502, [0xa005], manufacturerOptions);
                break;
            case 'siren_duration':
                await entity.read(0x0502, [0xa000], manufacturerOptions);
                break;
            case 'siren_and_light':
                await entity.read(0x0502, [0xa001], manufacturerOptions);
                break;
            case 'siren_volume':
                await entity.read(0x0502, [0xa002], manufacturerOptions);
                break;
            case 'alarm_state':
                await entity.read(0x0502, [0xf0], manufacturerOptions);
                break;
            default: // Unknown key
                throw new Error(`Unhandled key toZigbee.rbshoszbeu.convertGet ${key}`);
            }
        },
    } satisfies Tz.Converter,
    bhius_config: {
        key: Object.keys(buttonMap),
        convertGet: async (entity, key, meta) => {
            if (!buttonMap.hasOwnProperty(key)) {
                throw new Error(`Unknown key ${key}`);
            }
            await entity.read('boschSpecific', [buttonMap[key as keyof typeof buttonMap]], manufacturerOptions);
        },
        convertSet: async (entity, key, value, meta) => {
            if (!buttonMap.hasOwnProperty(key) ) {
                return;
            }

            const buffer = Buffer.from(value as string, 'hex');
            if (buffer.length !== 9) throw new Error(`Invalid configuration length: ${buffer.length} (should be 9)`);

            const payload: {[key: number | string]: KeyValue} = {};
            payload[buttonMap[key as keyof typeof buttonMap]] = {value: buffer, type: 65};
            await entity.write('boschSpecific', payload, manufacturerOptions);

            const result:{[key: number | string]: string} = {};
            result[key] = value as string;
            return {state: result};
        },
    } satisfies Tz.Converter,
};

const fzLocal = {
    bhius_button_press: {
        cluster: 'boschSpecific',
        type: 'raw',
        options: [e.text('led_response', ea.ALL).withLabel('LED config (confirmation response)').withDescription(labelConfirmation)],
        convert: async (model, msg, publish, options, meta) => {
            const sequenceNumber= msg.data.readUInt8(3);
            const buttonId = msg.data.readUInt8(4);
            const longPress = msg.data.readUInt8(5);
            const duration = msg.data.readUInt16LE(6);
            let buffer;
            if (options.hasOwnProperty('led_response')) {
                buffer = Buffer.from(options.led_response as string, 'hex');
                if (buffer.length !== 9) {
                    logger.error(`Invalid length of led_response: ${buffer.length} (should be 9)`, NS);
                    buffer = Buffer.from('30ff00000102010001', 'hex');
                }
            } else {
                buffer = Buffer.from('30ff00000102010001', 'hex');
            }

            if (utils.hasAlreadyProcessedMessage(msg, model, sequenceNumber)) return;
            const buttons: {[key: number]: string} = {0: 'top_left', 1: 'top_right', 2: 'bottom_left', 3: 'bottom_right'};

            let command = '';
            if (buttonId in buttons) {
                if (longPress && duration > 0) {
                    if (globalStore.hasValue(msg.endpoint, buttons[buttonId])) return;
                    globalStore.putValue(msg.endpoint, buttons[buttonId], duration);
                    command = 'longpress';
                } else {
                    globalStore.clearValue(msg.endpoint, buttons[buttonId]);
                    command = longPress ? 'longpress_release': 'release';
                    msg.endpoint.command('boschSpecific', 'confirmButtonPressed', {data: buffer}, {sendPolicy: 'immediate'})
                        .catch((error) => {});
                }
                return {action: `button_${buttons[buttonId]}_${command}`};
            } else {
                logger.error(`Received message with unknown command ID ${buttonId}. Data: 0x${msg.data.toString('hex')}`, NS);
            }
        },
    } satisfies Fz.Converter,
    bhius_config: {
        cluster: 'boschSpecific',
        type: ['attributeReport', 'readResponse'],
        convert: async (model, msg, publish, options, meta) => {
            const result: {[key: number | string]: string} = {};
            for (const id of Object.values(buttonMap)) {
                if (msg.data.hasOwnProperty(id)) {
                    result[Object.keys(buttonMap).find((key) => buttonMap[key] === id)] = msg.data[id].toString('hex');
                }
            }
            return result;
        },
    } satisfies Fz.Converter,
};

const definitions: Definition[] = [
    {
        zigbeeModel: ['RBSH-OS-ZB-EU'],
        model: 'BSIR-EZ',
        vendor: 'Bosch',
        description: 'Outdoor siren',
        fromZigbee: [fz.ias_alarm_only_alarm_1, fz.battery, fz.power_source],
        toZigbee: [tzLocal.rbshoszbeu, tz.warning],
        meta: {battery: {voltageToPercentage: {min: 2500, max: 4200}}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['genPowerCfg', 'ssIasZone', 'ssIasWd', 'genBasic']);
            await reporting.batteryVoltage(endpoint);
            await endpoint.read(0x0502, [0xa000, 0xa001, 0xa002, 0xa003, 0xa004, 0xa005], manufacturerOptions);
            await endpoint.unbind('genPollCtrl', coordinatorEndpoint);
        },
        exposes: [
            e.binary('alarm_state', ea.ALL, 'ON', 'OFF').withDescription('Alarm turn ON/OFF'),
            e.numeric('light_delay', ea.ALL).withValueMin(0).withValueMax(30).withValueStep(1)
                .withUnit('s').withDescription('Flashing light delay').withUnit('s'),
            e.numeric('siren_delay', ea.ALL).withValueMin(0).withValueMax(30).withValueStep(1)
                .withUnit('s').withDescription('Siren alarm delay').withUnit('s'),
            e.numeric('siren_duration', ea.ALL).withValueMin(1).withValueMax(15).withValueStep(1)
                .withUnit('m').withDescription('Duration of the alarm siren').withUnit('m'),
            e.numeric('light_duration', ea.ALL).withValueMin(1).withValueMax(15).withValueStep(1)
                .withUnit('m').withDescription('Duration of the alarm light').withUnit('m'),
            e.enum('siren_volume', ea.ALL, Object.keys(sirenVolume)).withDescription('Volume of the alarm'),
            e.enum('siren_and_light', ea.ALL, Object.keys(sirenLight)).withDescription('Siren and Light behaviour during alarm '),
            e.enum('power_source', ea.ALL, Object.keys(sirenPowerSupply)).withDescription('Siren power source'),
            e.warning()
                .removeFeature('strobe_level')
                .removeFeature('strobe')
                .removeFeature('strobe_duty_cycle')
                .removeFeature('level')
                .removeFeature('duration'),
            e.test(), e.tamper(), e.battery(), e.battery_voltage(), e.battery_low(),
            e.binary('ac_status', ea.STATE, true, false).withDescription('Is the device plugged in'),
        ],
        extend: [
            deviceAddCustomCluster(
                'ssIasZone',
                {
                    ID: Zcl.Clusters.ssIasZone.ID,
                    attributes: {},
                    commands: {
                        boschTestTamper: {
                            ID: 0xF3,
                            parameters: [
                                {name: 'data', type: Zcl.DataType.UINT8},
                            ],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            deviceAddCustomCluster(
                'ssIasWd',
                {
                    ID: Zcl.Clusters.ssIasWd.ID,
                    attributes: {},
                    commands: {
                        boschOutdoorSiren: {
                            ID: 240,
                            parameters: [
                                {name: 'data', type: Zcl.DataType.UINT8},
                            ],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            quirkCheckinInterval(0),
        ],
    },
    {
        zigbeeModel: ['RBSH-WS-ZB-EU'],
        model: 'BWA-1',
        vendor: 'Bosch',
        description: 'Smart water alarm',
        extend: [
            deviceAddCustomCluster(
                'boschSpecific',
                {
                    ID: 0xfcac,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        alarmOnMotion: {
                            ID: 0x0003,
                            type: Zcl.DataType.BOOLEAN,
                        },
                    },
                    commands: {},
                    commandsResponse: {},
                },
            ),
            iasZoneAlarm({
                zoneType: 'water_leak',
                zoneAttributes: ['tamper'],
            }),
            battery({
                percentage: true,
                lowStatus: true,
            }),
            binary({
                name: 'alarm_on_motion',
                cluster: 'boschSpecific',
                attribute: 'alarmOnMotion',
                description: 'Toggle audible alarm on motion',
                valueOn: ['ON', 0x01],
                valueOff: ['OFF', 0x00],
                zigbeeCommandOptions: manufacturerOptions,
                entityCategory: 'config',
            }),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read('genPowerCfg', ['batteryPercentageRemaining']);
            await endpoint.read('ssIasZone', ['zoneStatus']);
            await endpoint.read('boschSpecific', ['alarmOnMotion'], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ['RBSH-SD-ZB-EU'],
        model: 'BSD-2',
        vendor: 'Bosch',
        description: 'Smoke alarm II',
        extend: [
            deviceAddCustomCluster(
                'ssIasZone',
                {
                    ID: Zcl.Clusters.ssIasZone.ID,
                    attributes: {},
                    commands: {
                        boschSmokeAlarmSiren: {
                            ID: 0x80,
                            parameters: [{name: 'data', type: Zcl.DataType.UINT16}],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            boschModernExtend.smokeAlarm(),
            battery({
                percentage: true,
                lowStatus: false,
            }),
            enumLookup({
                name: 'sensitivity',
                cluster: 'ssIasZone',
                attribute: 'currentZoneSensitivityLevel',
                description: 'Sensitivity of the smoke detector',
                lookup: {
                    'low': 0x00,
                    'medium': 0x01,
                    'high': 0x02,
                },
                entityCategory: 'config',
            }),
            boschModernExtend.broadcastAlarm(),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read('genPowerCfg', ['batteryPercentageRemaining']);
            await endpoint.read('ssIasZone', ['zoneStatus']);
            await endpoint.read('ssIasZone', ['currentZoneSensitivityLevel']);
        },
    },
    {
        zigbeeModel: ['RFDL-ZB', 'RFDL-ZB-EU', 'RFDL-ZB-H', 'RFDL-ZB-K', 'RFDL-ZB-CHI', 'RFDL-ZB-MS', 'RFDL-ZB-ES', 'RFPR-ZB',
            'RFPR-ZB-EU', 'RFPR-ZB-CHI', 'RFPR-ZB-ES', 'RFPR-ZB-MS'],
        model: 'RADON TriTech ZB',
        vendor: 'Bosch',
        description: 'Wireless motion detector',
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1, fz.illuminance],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: '3V_2500'}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['msTemperatureMeasurement', 'genPowerCfg', 'msIlluminanceMeasurement']);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
            await reporting.illuminance(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper(), e.illuminance(), e.illuminance_lux()],
    },
    {
        zigbeeModel: ['ISW-ZPR1-WP13'],
        model: 'ISW-ZPR1-WP13',
        vendor: 'Bosch',
        description: 'Motion sensor',
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1, fz.ignore_iaszone_report],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: '3V_2500'}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(5);
            await reporting.bind(endpoint, coordinatorEndpoint, ['msTemperatureMeasurement', 'genPowerCfg']);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper()],
    },
    {
        zigbeeModel: ['RBSH-TRV0-ZB-EU'],
        model: 'BTH-RA',
        vendor: 'Bosch',
        description: 'Radiator thermostat II',
        extend: [
            boschModernExtend.hvacThermostatCluster(),
            boschModernExtend.hvacUserInterfaceCfgCluster(),
            boschModernExtend.radiatorThermostat(),
            battery({
                percentage: true,
                lowStatus: false,
            }),
            boschModernExtend.operatingMode(),
            boschModernExtend.windowDetection(),
            boschModernExtend.boostHeating(),
            numeric({
                name: 'remote_temperature',
                cluster: 'hvacThermostat',
                attribute: 'remoteTemperature',
                description: 'Input for remote temperature sensor. ' +
                    'Required at least every 30 min. to prevent fallback to internal sensor!',
                valueMin: 0.0,
                valueMax: 35.0,
                valueStep: 0.01,
                unit: '°C',
                scale: 100,
                zigbeeCommandOptions: manufacturerOptions,
            }),
            enumLookup({
                name: 'setpoint_change_source',
                cluster: 'hvacThermostat',
                attribute: 'setpointChangeSource',
                reporting: {min: '10_SECONDS', max: 'MAX', change: null},
                description: 'Source of the current setpoint temperature',
                lookup: {'manual': 0x00, 'schedule': 0x01, 'externally': 0x02},
                access: 'STATE_GET',
            }),
            boschModernExtend.childLock(),
            boschModernExtend.displayOntime(),
            boschModernExtend.displayBrightness(),
            enumLookup({
                name: 'display_orientation',
                cluster: 'hvacUserInterfaceCfg',
                attribute: 'displayOrientation',
                description: 'Sets orientation of the display',
                lookup: {'normal': 0x00, 'flipped': 0x01},
                zigbeeCommandOptions: manufacturerOptions,
            }),
            enumLookup({
                name: 'displayed_temperature',
                cluster: 'hvacUserInterfaceCfg',
                attribute: 'displayedTemperature',
                description: 'Temperature displayed on the TRV',
                lookup: {'target': 0x00, 'measured': 0x01},
                zigbeeCommandOptions: manufacturerOptions,
            }),
            enumLookup({
                name: 'valve_adapt_status',
                cluster: 'hvacThermostat',
                attribute: 'valveAdaptStatus',
                reporting: {min: '10_SECONDS', max: 'MAX', change: null},
                description: 'Specifies the current status of the valve adaptation',
                lookup: {
                    'none': 0x00,
                    'ready_to_calibrate': 0x01,
                    'calibration_in_progress': 0x02,
                    'error': 0x03,
                    'success': 0x04,
                },
                zigbeeCommandOptions: manufacturerOptions,
                access: 'STATE_GET',
            }),
            boschModernExtend.valveAdaptProcess(),
            boschModernExtend.heatingDemand(),
            boschModernExtend.ignoreDst(),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
            ota(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, [
                'hvacThermostat', 'hvacUserInterfaceCfg',
            ]);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.configureReporting('hvacThermostat', [{
                attribute: 'heatingDemand',
                minimumReportInterval: constants.repInterval.SECONDS_10,
                maximumReportInterval: constants.repInterval.MAX,
                reportableChange: null,
            }], manufacturerOptions);
            await endpoint.read('genPowerCfg', ['batteryPercentageRemaining']);
            await endpoint.read('hvacThermostat', ['localTemperatureCalibration', 'setpointChangeSource']);
            await endpoint.read('hvacThermostat', [
                'operatingMode', 'heatingDemand', 'valveAdaptStatus', 'remoteTemperature', 'windowDetection', 'boostHeating',
            ], manufacturerOptions);
            await endpoint.read('hvacUserInterfaceCfg', ['keypadLockout']);
            await endpoint.read('hvacUserInterfaceCfg', [
                'displayOrientation', 'displayedTemperature', 'displayOntime', 'displayBrightness',
            ], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ['RBSH-RTH0-BAT-ZB-EU'],
        model: 'BTH-RM',
        vendor: 'Bosch',
        description: 'Room thermostat II (Battery model)',
        extend: [
            boschModernExtend.hvacThermostatCluster(),
            boschModernExtend.hvacUserInterfaceCfgCluster(),
            boschModernExtend.roomThermostat(),
            battery({
                voltageToPercentage: {min: 4400, max: 6400},
                percentage: true,
                voltage: true,
                lowStatus: false,
                voltageReporting: true,
                percentageReporting: false,
            }),
            humidity(),
            boschModernExtend.operatingMode(),
            boschModernExtend.windowDetection(),
            boschModernExtend.boostHeating(),
            boschModernExtend.childLock(),
            boschModernExtend.displayOntime(),
            boschModernExtend.displayBrightness(),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
            ota(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, [
                'hvacThermostat', 'hvacUserInterfaceCfg',
            ]);
            await reporting.thermostatSystemMode(endpoint);
            await reporting.thermostatRunningState(endpoint);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatOccupiedCoolingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.read('genPowerCfg', ['batteryVoltage']);
            await endpoint.read('hvacThermostat', ['localTemperatureCalibration']);
            await endpoint.read('hvacThermostat', ['operatingMode', 'windowDetection', 'boostHeating'], manufacturerOptions);
            await endpoint.read('hvacUserInterfaceCfg', ['keypadLockout']);
            await endpoint.read('hvacUserInterfaceCfg', ['displayOntime', 'displayBrightness'], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ['RBSH-RTH0-ZB-EU'],
        model: 'BTH-RM230Z',
        vendor: 'Bosch',
        description: 'Room thermostat II 230V',
        extend: [
            boschModernExtend.hvacThermostatCluster(),
            boschModernExtend.hvacUserInterfaceCfgCluster(),
            boschModernExtend.roomThermostat(),
            humidity(),
            boschModernExtend.operatingMode(),
            boschModernExtend.windowDetection(),
            boschModernExtend.boostHeating(),
            boschModernExtend.childLock(),
            boschModernExtend.displayOntime(),
            boschModernExtend.displayBrightness(),
            ota(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, [
                'hvacThermostat', 'hvacUserInterfaceCfg',
            ]);
            await reporting.thermostatSystemMode(endpoint);
            await reporting.thermostatRunningState(endpoint);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatOccupiedCoolingSetpoint(endpoint, {
                min: constants.repInterval.SECONDS_10,
                max: constants.repInterval.HOUR,
                change: 50,
            });
            await reporting.thermostatKeypadLockMode(endpoint);
            await endpoint.read('hvacThermostat', ['localTemperatureCalibration']);
            await endpoint.read('hvacThermostat', ['operatingMode', 'windowDetection', 'boostHeating'], manufacturerOptions);
            await endpoint.read('hvacUserInterfaceCfg', ['keypadLockout']);
            await endpoint.read('hvacUserInterfaceCfg', ['displayOntime', 'displayBrightness'], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ['Champion'],
        model: '8750001213',
        vendor: 'Bosch',
        description: 'Twinguard',
        extend: [
            deviceAddCustomCluster(
                'twinguardSmokeDetector',
                {
                    ID: 0xe000,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        sensitivity: {ID: 0x4003, type: Zcl.DataType.UINT16},
                    },
                    commands: {
                        initiateTestMode: {
                            ID: 0x00,
                            parameters: [],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            deviceAddCustomCluster(
                'twinguardMeasurements',
                {
                    ID: 0xe002,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        humidity: {ID: 0x4000, type: Zcl.DataType.UINT16},
                        unknown1: {ID: 0x4001, type: Zcl.DataType.UINT16},
                        unknown2: {ID: 0x4002, type: Zcl.DataType.UINT16},
                        airpurity: {ID: 0x4003, type: Zcl.DataType.UINT16},
                        temperature: {ID: 0x4004, type: Zcl.DataType.INT16},
                        illuminance_lux: {ID: 0x4005, type: Zcl.DataType.UINT16},
                        battery: {ID: 0x4006, type: Zcl.DataType.UINT16},
                        unknown3: {ID: 0x4007, type: Zcl.DataType.UINT16},
                        unknown4: {ID: 0x4008, type: Zcl.DataType.UINT16},
                        pressure: {ID: 0x4009, type: Zcl.DataType.UINT16}, // Not yet confirmed
                        unknown6: {ID: 0x400a, type: Zcl.DataType.UINT16},
                        unknown7: {ID: 0x400b, type: Zcl.DataType.UINT16},
                        unknown8: {ID: 0x400c, type: Zcl.DataType.UINT16},
                    },
                    commands: {},
                    commandsResponse: {},
                },
            ),
            deviceAddCustomCluster(
                'twinguardOptions',
                {
                    ID: 0xe004,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        unknown1: {ID: 0x4000, type: Zcl.DataType.BITMAP8}, // 0,1 ??? read during pairing
                        pre_alarm: {ID: 0x4001, type: Zcl.DataType.BITMAP8}, // 0,1 on/off
                    },
                    commands: {},
                    commandsResponse: {},
                },
            ),
            deviceAddCustomCluster(
                'twinguardSetup',
                {
                    ID: 0xe006,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        unknown1: {ID: 0x5003, type: Zcl.DataType.INT8}, // perhaps signal strength? -7?
                        unknown2: {ID: 0x5004, type: Zcl.DataType.UINT8}, // ????
                        heartbeat: {ID: 0x5005, type: Zcl.DataType.BITMAP8}, // 0
                    },
                    commands: {
                        pairingCompleted: {
                            ID: 0x01,
                            parameters: [],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            deviceAddCustomCluster(
                'twinguardAlarm',
                {
                    ID: 0xe007,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        alarm_status: {ID: 0x5000, type: Zcl.DataType.BITMAP32},
                    },
                    commands: {
                        burglarAlarm: {
                            ID: 0x01,
                            parameters: [
                                {name: 'data', type: Zcl.DataType.UINT8}, // data:1 trips the siren data:0 should stop the siren
                            ],
                        },
                    },
                    commandsResponse: {},
                },
            ),
            boschModernExtend.twinguard(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            await reporting.bind(device.getEndpoint(7), coordinatorEndpoint, ['genPollCtrl']);
            await reporting.bind(device.getEndpoint(1), coordinatorEndpoint, ['genAlarms', 'twinguardSmokeDetector', 'twinguardOptions']);
            await reporting.bind(device.getEndpoint(3), coordinatorEndpoint, ['twinguardMeasurements']);
            await reporting.bind(device.getEndpoint(12), coordinatorEndpoint, ['twinguardSetup', 'twinguardAlarm']);
            await device.getEndpoint(1).read('twinguardOptions', ['unknown1'], manufacturerOptions); // Needed for pairing
            await device.getEndpoint(12).command('twinguardSetup', 'pairingCompleted', manufacturerOptions); // Needed for pairing
            await device.getEndpoint(1).write('twinguardSmokeDetector', {sensitivity: 0x0002}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(1).write('twinguardOptions', {pre_alarm: 0x01}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(12).write('twinguardSetup', {heartbeat: 0x01}, manufacturerOptions); // Setting defaults
            await device.getEndpoint(1).read('twinguardSmokeDetector', ['sensitivity'], manufacturerOptions);
            await device.getEndpoint(1).read('twinguardOptions', ['pre_alarm'], manufacturerOptions);
            await device.getEndpoint(12).read('twinguardSetup', ['heartbeat'], manufacturerOptions);
        },
    },
    {
        zigbeeModel: ['RFPR-ZB-SH-EU'],
        model: 'RFPR-ZB-SH-EU',
        vendor: 'Bosch',
        description: 'Wireless motion detector',
        fromZigbee: [fz.temperature, fz.battery, fz.ias_occupancy_alarm_1],
        toZigbee: [],
        meta: {battery: {voltageToPercentage: '3V_2500'}},
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['msTemperatureMeasurement', 'genPowerCfg']);
            await reporting.temperature(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
        exposes: [e.temperature(), e.battery(), e.occupancy(), e.battery_low(), e.tamper()],
    },
    {
        zigbeeModel: ['RBSH-SP-ZB-EU', 'RBSH-SP-ZB-FR', 'RBSH-SP-ZB-GB'],
        model: 'BSP-FZ2',
        vendor: 'Bosch',
        description: 'Plug compact EU',
        fromZigbee: [fz.on_off, fz.power_on_behavior, fz.electrical_measurement, fz.metering],
        toZigbee: [tz.on_off, tz.power_on_behavior],
        extend: [ota()],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read('genOnOff', ['onOff', 'startUpOnOff']);
            await reporting.bind(endpoint, coordinatorEndpoint, ['genOnOff']);
            await reporting.bind(endpoint, coordinatorEndpoint, ['seMetering']);
            await reporting.readMeteringMultiplierDivisor(endpoint);
            await reporting.currentSummDelivered(endpoint, {change: [0, 1]});
            await reporting.bind(endpoint, coordinatorEndpoint, ['haElectricalMeasurement']);
            await endpoint.read('haElectricalMeasurement', ['acPowerMultiplier', 'acPowerDivisor']);
            await reporting.activePower(endpoint);
        },
        exposes: [e.switch(), e.power_on_behavior(), e.power(), e.energy()],
        whiteLabel: [
            {vendor: 'Bosch', model: 'BSP-EZ2', description: 'Plug compact FR', fingerprint: [{modelID: 'RBSH-SP-ZB-FR'}]},
            {vendor: 'Bosch', model: 'BSP-GZ2', description: 'Plug compact UK', fingerprint: [{modelID: 'RBSH-SP-ZB-GB'}]},
        ],
    },
    {
        zigbeeModel: ['RBSH-SWD-ZB'],
        model: 'BSEN-C2',
        vendor: 'Bosch',
        description: 'Door/window contact II',
        extend: [
            boschModernExtend.doorWindowContact(false),
            battery({
                percentage: true,
                lowStatus: true,
            }),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read('genPowerCfg', ['batteryPercentageRemaining']);
            await endpoint.read('ssIasZone', ['zoneStatus']);
        },
    },
    {
        zigbeeModel: ['RBSH-SWDV-ZB'],
        model: 'BSEN-CV',
        vendor: 'Bosch',
        description: 'Door/window contact II plus',
        extend: [
            boschModernExtend.doorWindowContact(true),
            battery({
                percentage: true,
                lowStatus: true,
            }),
            bindCluster({
                cluster: 'genPollCtrl',
                clusterType: 'input',
            }),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);
            await endpoint.read('genPowerCfg', ['batteryPercentageRemaining']);
            await endpoint.read('ssIasZone', ['zoneStatus']);
        },
    },
    {
        zigbeeModel: ['RBSH-MMD-ZB-EU'],
        model: 'BMCT-DZ',
        vendor: 'Bosch',
        description: 'Phase-cut dimmer',
        extend: [identify(), light({configureReporting: true, effect: false})],
    },
    {
        zigbeeModel: ['RBSH-MMR-ZB-EU'],
        model: 'BMCT-RZ',
        vendor: 'Bosch',
        description: 'Relay, potential free',
        extend: [onOff({powerOnBehavior: false})],
    },
    {
        zigbeeModel: ['RBSH-MMS-ZB-EU'],
        model: 'BMCT-SLZ',
        vendor: 'Bosch',
        description: 'Light/shutter control unit II',
        extend: [
            deviceEndpoints({endpoints: {'left': 2, 'right': 3}}),
            deviceAddCustomCluster(
                'boschSpecific',
                {
                    ID: 0xfca0,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {
                        deviceMode: {ID: 0x0000, type: Zcl.DataType.ENUM8},
                        switchType: {ID: 0x0001, type: Zcl.DataType.ENUM8},
                        calibrationOpeningTime: {ID: 0x0002, type: Zcl.DataType.UINT32},
                        calibrationClosingTime: {ID: 0x0003, type: Zcl.DataType.UINT32},
                        calibrationButtonHoldTime: {ID: 0x0005, type: Zcl.DataType.UINT8},
                        childLock: {ID: 0x0008, type: Zcl.DataType.BOOLEAN},
                        calibrationMotorStartDelay: {ID: 0x000f, type: Zcl.DataType.UINT8},
                        motorState: {ID: 0x0013, type: Zcl.DataType.ENUM8},
                    },
                    commands: {},
                    commandsResponse: {},
                },
            ),
            boschModernExtend.bmct(),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint1 = device.getEndpoint(1);
            await reporting.bind(endpoint1, coordinatorEndpoint, [
                'genIdentify', 'closuresWindowCovering', 'boschSpecific',
            ]);
            await reporting.currentPositionLiftPercentage(endpoint1);
            await endpoint1.read('boschSpecific', [
                'deviceMode',
                'switchType',
                'motorState',
                'childLock',
                'calibrationOpeningTime',
                'calibrationClosingTime',
                'calibrationButtonHoldTime',
                'calibrationMotorStartDelay',
            ]);
            const endpoint2 = device.getEndpoint(2);
            await endpoint2.read('boschSpecific', ['childLock']);
            await reporting.bind(endpoint2, coordinatorEndpoint, [
                'genIdentify', 'genOnOff',
            ]);
            await reporting.onOff(endpoint2);
            const endpoint3 = device.getEndpoint(3);
            await endpoint3.read('boschSpecific', ['childLock']);
            await reporting.bind(endpoint3, coordinatorEndpoint, [
                'genIdentify', 'genOnOff',
            ]);
            await reporting.onOff(endpoint3);
        },
        exposes: (device, options) => {
            const stateDeviceMode: KeyValue = {
                'light': 0x04,
                'shutter': 0x01,
                'disabled': 0x00,
            };
            const stateMotor: KeyValue = {
                'stopped': 0x00,
                'opening': 0x01,
                'closing': 0x02,
            };
            const stateSwitchType: KeyValue = {
                'button': 0x01,
                'button_key_change': 0x02,
                'rocker_switch': 0x03,
                'rocker_switch_key_change': 0x04,
            };
            const commonExposes = [
                e.enum('switch_type', ea.ALL, Object.keys(stateSwitchType))
                    .withDescription('Module controlled by a rocker switch or a button'),
                e.linkquality(),
            ];
            const lightExposes = [
                e.switch().withEndpoint('left'),
                e.switch().withEndpoint('right'),
                e.power_on_behavior().withEndpoint('left'),
                e.power_on_behavior().withEndpoint('right'),
                e.binary('child_lock', ea.ALL, 'ON', 'OFF').withEndpoint('left')
                    .withDescription('Enable/Disable child lock'),
                e.binary('child_lock', ea.ALL, 'ON', 'OFF').withEndpoint('right')
                    .withDescription('Enable/Disable child lock'),
            ];
            const coverExposes = [
                e.cover_position(),
                e.enum('motor_state', ea.STATE, Object.keys(stateMotor))
                    .withDescription('Current shutter motor state'),
                e.binary('child_lock', ea.ALL, 'ON', 'OFF')
                    .withDescription('Enable/Disable child lock'),
                e.numeric('calibration_closing_time', ea.ALL).withUnit('s')
                    .withDescription('Calibrate shutter closing time')
                    .withValueMin(1).withValueMax(90).withValueStep(0.1),
                e.numeric('calibration_opening_time', ea.ALL).withUnit('s')
                    .withDescription('Calibrate shutter opening time')
                    .withValueMin(1).withValueMax(90).withValueStep(0.1),
                e.numeric('calibration_button_hold_time', ea.ALL).withUnit('s')
                    .withDescription('Time to hold for long press')
                    .withValueMin(0.1).withValueMax(2).withValueStep(0.1),
                e.numeric('calibration_motor_start_delay', ea.ALL).withUnit('s')
                    .withDescription('Delay between command and motor start')
                    .withValueMin(0).withValueMax(20).withValueStep(0.1),
            ];

            if (device) {
                const deviceModeKey = device.getEndpoint(1).getClusterAttributeValue('boschSpecific', 'deviceMode');
                const deviceMode = Object.keys(stateDeviceMode).find((key) => stateDeviceMode[key] === deviceModeKey);

                if (deviceMode === 'light') {
                    return [...commonExposes, ...lightExposes];
                } else if (deviceMode === 'shutter') {
                    return [...commonExposes, ...coverExposes];
                }
            }
            return [e.enum('device_mode', ea.ALL, Object.keys(stateDeviceMode)).withDescription('Device mode'),
                e.linkquality()];
        },
    },
    {
        zigbeeModel: ['RBSH-US4BTN-ZB-EU'],
        model: 'BHI-US',
        vendor: 'Bosch',
        description: 'Universal Switch II',
        fromZigbee: [fzLocal.bhius_button_press, fzLocal.bhius_config, fz.battery],
        toZigbee: [tzLocal.bhius_config],
        exposes: [
            e.battery_low(),
            e.battery_voltage(),
            e.text('config_led_top_left_press', ea.ALL).withLabel('LED config (top left short press)')
                .withDescription(labelShortPress)
                .withCategory('config'),
            e.text('config_led_top_right_press', ea.ALL).withLabel('LED config (top right short press)')
                .withDescription(labelShortPress)
                .withCategory('config'),
            e.text('config_led_bottom_left_press', ea.ALL).withLabel('LED config (bottom left short press)')
                .withDescription(labelShortPress)
                .withCategory('config'),
            e.text('config_led_bottom_right_press', ea.ALL).withLabel('LED config (bottom right short press)')
                .withDescription(labelShortPress)
                .withCategory('config'),
            e.text('config_led_top_left_longpress', ea.ALL).withLabel('LED config (top left long press)')
                .withDescription(labelLongPress)
                .withCategory('config'),
            e.text('config_led_top_right_longpress', ea.ALL).withLabel('LED config (top right long press)')
                .withDescription(labelLongPress)
                .withCategory('config'),
            e.text('config_led_bottom_left_longpress', ea.ALL).withLabel('LED config (bottom left long press)')
                .withDescription(labelLongPress)
                .withCategory('config'),
            e.text('config_led_bottom_right_longpress', ea.ALL).withLabel('LED config (bottom right long press)')
                .withDescription(labelLongPress)
                .withCategory('config'),
        ],
        extend: [
            deviceAddCustomCluster(
                'boschSpecific',
                {
                    ID: 0xfca1,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                    attributes: {},
                    commands: {
                        confirmButtonPressed: {
                            ID: 0x0010,
                            parameters: [
                                {name: 'data', type: Zcl.BuffaloZclDataType.BUFFER},
                            ],
                        },
                        pairingCompleted: {
                            ID: 0x0012,
                            parameters: [
                                {name: 'data', type: Zcl.BuffaloZclDataType.BUFFER},
                            ],
                        },
                    },
                    commandsResponse: {},
                },
            ),
        ],
        configure: async (device, coordinatorEndpoint) => {
            const endpoint = device.getEndpoint(1);

            // Read default LED configuration
            await endpoint.read('boschSpecific', [0x0010, 0x0011, 0x0012, 0x0013], {...manufacturerOptions, sendPolicy: 'immediate'})
                .catch((error) => {});
            await endpoint.read('boschSpecific', [0x0020, 0x0021, 0x0022, 0x0023], {...manufacturerOptions, sendPolicy: 'immediate'})
                .catch((error) => {});

            // We also have to read this one. Value reads 0x0f, looks like a bitmap
            await endpoint.read('boschSpecific', [0x0024], {...manufacturerOptions, sendPolicy: 'immediate'});

            await endpoint.command('boschSpecific', 'pairingCompleted', {data: Buffer.from([0x00])}, {sendPolicy: 'immediate'});

            await reporting.bind(endpoint, coordinatorEndpoint, ['genPowerCfg', 'genBasic', 'boschSpecific']);
            await reporting.batteryPercentageRemaining(endpoint);
            await reporting.batteryVoltage(endpoint);
        },
    },
];

export default definitions;
module.exports = definitions;
