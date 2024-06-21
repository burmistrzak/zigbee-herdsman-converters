import {Fz, Tz, ModernExtend, Configure, Expose, KeyValue} from './types';
import {presets as e, access as ea} from './exposes';
import {
    identify, light, onOff, quirkCheckinInterval,
    deviceAddCustomCluster, binary, numeric, enumLookup,
    battery, humidity, iasZoneAlarm, bindCluster,
    ota, deviceEndpoints,
} from './modernExtend';
import * as utils from './utils';
import {fz} from '../converters/fromZigbee';
import {tz} from '../converters/toZigbee';
import {Zcl, ZSpec} from 'zigbee-herdsman';
import {logger} from './logger';

const NS = 'zhc:bosch';
const manufacturerOpts = {manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH};

export const boschModernExtend = {
    hvacThermostatCluster: () => deviceAddCustomCluster(
        'hvacThermostat',
        {
            ID: Zcl.Clusters.hvacThermostat.ID,
            attributes: {
                operatingMode: {
                    ID: 0x4007,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                heatingDemand: {
                    ID: 0x4020,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                valveAdaptStatus: {
                    ID: 0x4022,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                remoteTemperature: {
                    ID: 0x4040,
                    type: Zcl.DataType.INT16,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                windowDetection: {
                    ID: 0x4042,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                boostHeating: {
                    ID: 0x4043,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
            },
            commands: {
                calibrateValve: {
                    ID: 0x41,
                    parameters: [],
                },
            },
            commandsResponse: {},
        },
    ),
    hvacUserInterfaceCfgCluster: () => deviceAddCustomCluster(
        'hvacUserInterfaceCfg',
        {
            ID: Zcl.Clusters.hvacUserInterfaceCfg.ID,
            attributes: {
                displayOrientation: {
                    ID: 0x400b,
                    type: Zcl.DataType.UINT8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayedTemperature: {
                    ID: 0x4039,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayOntime: {
                    ID: 0x403a,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
                displayBrightness: {
                    ID: 0x403b,
                    type: Zcl.DataType.ENUM8,
                    manufacturerCode: Zcl.ManufacturerCode.ROBERT_BOSCH_GMBH,
                },
            },
            commands: {},
            commandsResponse: {},
        },
    ),
    operatingMode: () => enumLookup({
        name: 'operating_mode',
        cluster: 'hvacThermostat',
        attribute: 'operatingMode',
        reporting: {min: '10_SECONDS', max: 'MAX', change: null},
        description: 'Bosch-specific operating mode (overrides system mode)',
        lookup: {'schedule': 0x00, 'manual': 0x01, 'pause': 0x05},
        zigbeeCommandOptions: manufacturerOpts,
    }),
    windowDetection: () => binary({
        name: 'window_detection',
        cluster: 'hvacThermostat',
        attribute: 'windowDetection',
        description: 'Enable/disable window open (Lo.) mode',
        valueOn: ['ON', 0x01],
        valueOff: ['OFF', 0x00],
        zigbeeCommandOptions: manufacturerOpts,
    }),
    boostHeating: () => binary({
        name: 'boost_heating',
        cluster: 'hvacThermostat',
        attribute: 'boostHeating',
        reporting: {min: '10_SECONDS', max: 'MAX', change: null, attribute: 'boostHeating'},
        description: 'Activate boost heating (5 min. on TRV)',
        valueOn: ['ON', 0x01],
        valueOff: ['OFF', 0x00],
        zigbeeCommandOptions: manufacturerOpts,
    }),
    childLock: () => binary({
        name: 'child_lock',
        cluster: 'hvacUserInterfaceCfg',
        attribute: 'keypadLockout',
        description: 'Enables/disables physical input on the device',
        valueOn: ['LOCK', 0x01],
        valueOff: ['UNLOCK', 0x00],
    }),
    displayOntime: () => numeric({
        name: 'display_ontime',
        cluster: 'hvacUserInterfaceCfg',
        attribute: 'displayOntime',
        description: 'Sets the display on-time',
        valueMin: 5,
        valueMax: 30,
        unit: 's',
        zigbeeCommandOptions: manufacturerOpts,
    }),
    displayBrightness: () => numeric({
        name: 'display_brightness',
        cluster: 'hvacUserInterfaceCfg',
        attribute: 'displayBrightness',
        description: 'Sets brightness of the display',
        valueMin: 0,
        valueMax: 10,
        zigbeeCommandOptions: manufacturerOpts,
    }),
    valveAdaptProcess: (): ModernExtend => {
        const adaptationStatus: KeyValue = {
            'none': 0x00,
            'ready_to_calibrate': 0x01,
            'calibration_in_progress': 0x02,
            'error': 0x03,
            'success': 0x04,
        };
        const exposes: Expose[] = [
            e.binary('valve_adapt_process', ea.ALL, true, false)
                .withLabel('Trigger adaptation process')
                .withDescription('Trigger the valve adaptation process. Only possible when adaptation status ' +
                'is "ready_to_calibrate" or "error".').withCategory('config'),
        ];
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'hvacThermostat',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('valveAdaptStatus')) {
                    if (msg.data['valveAdaptStatus'] === adaptationStatus.calibration_in_progress) {
                        result.valve_adapt_process = true;
                    } else {
                        result.valve_adapt_process = false;
                    }
                }
                return result;
            },
        }];
        const toZigbee: Tz.Converter[] = [{
            key: ['valve_adapt_process'],
            convertSet: async (entity, key, value, meta) => {
                if (value == true) {
                    const adaptStatus = utils.getFromLookup(meta.state.valve_adapt_status, adaptationStatus);
                    switch (adaptStatus) {
                    case adaptationStatus.ready_to_calibrate:
                    case adaptationStatus.error:
                        await entity.command('hvacThermostat', 'calibrateValve', {}, manufacturerOpts);
                        break;
                    default:
                        throw new Error('Valve adaptation process not possible right now.');
                    }
                }
                return {state: {valve_adapt_process: value}};
            },
            convertGet: async (entity, key, meta) => {
                await entity.read('hvacThermostat', ['valveAdaptStatus'], manufacturerOpts);
            },
        }];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    heatingDemand: (): ModernExtend => {
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'hvacThermostat',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('heatingDemand')) {
                    const demand = msg.data['heatingDemand'] as number;
                    result.pi_heating_demand = demand;
                    result.running_state = demand > 0 ? 'heat' : 'idle';
                }
                return result;
            },
        }];
        const toZigbee: Tz.Converter[] = [{
            key: ['pi_heating_demand'],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'pi_heating_demand') {
                    let demand = utils.toNumber(value, key);
                    demand = utils.numberWithinRange(demand, 0, 100);
                    await entity.write('hvacThermostat', {heatingDemand: demand}, manufacturerOpts);
                    return {state: {pi_heating_demand: demand}};
                }
            },
            convertGet: async (entity, key, meta) => {
                await entity.read('hvacThermostat', ['heatingDemand'], manufacturerOpts);
            },
        }, {
            key: ['running_state'],
            convertGet: async (entity, key, meta) => {
                await entity.read('hvacThermostat', ['heatingDemand'], manufacturerOpts);
            },
        }];
        return {
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    ignoreDst: (): ModernExtend => {
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'genTime',
            type: 'read',
            convert: async (model, msg, publish, options, meta) => {
                if (msg.data.includes('dstStart', 'dstEnd', 'dstShift')) {
                    const response = {
                        'dstStart': {attribute: 0x0003, status: Zcl.Status.SUCCESS, value: 0x00},
                        'dstEnd': {attribute: 0x0004, status: Zcl.Status.SUCCESS, value: 0x00},
                        'dstShift': {attribute: 0x0005, status: Zcl.Status.SUCCESS, value: 0x00},
                    };
                    await msg.endpoint.readResponse(msg.cluster, msg.meta.zclTransactionSequenceNumber, response);
                }
            },
        }];
        return {
            fromZigbee,
            isModernExtend: true,
        };
    },
    roomThermostat: (): ModernExtend => {
        const exposes: Expose[] = [
            e.climate()
                .withLocalTemperature()
                .withSetpoint('occupied_heating_setpoint', 4.5, 30, 0.5)
                .withSetpoint('occupied_cooling_setpoint', 4.5, 30, 0.5)
                .withLocalTemperatureCalibration(-5, 5, 0.1)
                .withSystemMode(['off', 'heat', 'cool'])
                .withRunningState(['idle', 'heat', 'cool']),
        ];
        const fromZigbee: Fz.Converter[] = [
            fz.thermostat,
            fz.hvac_user_interface,
        ];
        const toZigbee: Tz.Converter[] = [
            tz.thermostat_system_mode,
            tz.thermostat_running_state,
            tz.thermostat_occupied_heating_setpoint,
            tz.thermostat_occupied_cooling_setpoint,
            tz.thermostat_programming_operation_mode, // NOTE: Only 0x0 & 0x1 supported
            tz.thermostat_local_temperature_calibration,
            tz.thermostat_local_temperature,
            tz.thermostat_temperature_setpoint_hold,
            tz.thermostat_temperature_display_mode,
        ];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    radiatorThermostat: (): ModernExtend => {
        const exposes: Expose[] = [
            e.climate()
                .withLocalTemperature(ea.STATE_GET, 'Temperature used by the heating algorithm. Might be a remote sensor.')
                .withLocalTemperatureCalibration(-5, 5, 0.1)
                .withSetpoint('occupied_heating_setpoint', 5, 30, 0.5)
                .withSystemMode(['heat'])
                .withPiHeatingDemand(ea.ALL)
                .withRunningState(['idle', 'heat'], ea.STATE_GET),
        ];
        const fromZigbee: Fz.Converter[] = [
            fz.thermostat,
            fz.hvac_user_interface,
        ];
        const toZigbee: Tz.Converter[] = [
            tz.thermostat_system_mode,
            tz.thermostat_occupied_heating_setpoint,
            tz.thermostat_local_temperature_calibration,
            tz.thermostat_local_temperature,
            tz.thermostat_keypad_lockout,
        ];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    doorWindowContact: (hasVibrationSensor?: boolean): ModernExtend => {
        const exposes: Expose[] = [
            e.binary('contact', ea.STATE, false, true)
                .withDescription('Indicates whether the device is opened or closed'),
            e.enum('action', ea.STATE, ['none', 'single', 'long'])
                .withDescription('Triggered action (e.g. a button click)').withCategory('diagnostic'),
        ];
        if (hasVibrationSensor) {
            exposes.push(e.binary('vibration', ea.STATE, true, false)
                .withDescription('Indicates whether the device detected vibration'));
        }
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'ssIasZone',
            type: ['commandStatusChangeNotification', 'attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                if (msg.data.hasOwnProperty('zoneStatus') || msg.data.hasOwnProperty('zonestatus')) {
                    const zoneStatus = msg.type === 'commandStatusChangeNotification' ? msg.data.zonestatus : msg.data.zoneStatus;
                    const lookup: KeyValue = {0x00: 'none', 0x01: 'single', 0x02: 'long'};
                    const result: KeyValue = {
                        contact: !((zoneStatus & 1) > 0),
                        vibration: (zoneStatus & 1<<1) > 0,
                        tamper: (zoneStatus & 1 << 2) > 0,
                        battery_low: (zoneStatus & 1 << 3) > 0,
                        supervision_reports: (zoneStatus & 1 << 4) > 0,
                        restore_reports: (zoneStatus & 1 << 5) > 0,
                        trouble: (zoneStatus & 1 << 6) > 0,
                        ac_status: (zoneStatus & 1 << 7) > 0,
                        test: (zoneStatus & 1 << 8) > 0,
                        battery_defect: (zoneStatus & 1 << 9) > 0,
                        action: lookup[(zoneStatus >> 11) & 3],
                    };
                    if (result.action === 'none') delete result.action;
                    return result;
                }
            },
        }];
        return {
            exposes,
            fromZigbee,
            isModernExtend: true,
        };
    },
    smokeAlarm: (): ModernExtend => {
        const smokeAlarm: KeyValue = {
            'OFF': 0x0000,
            'ON': 0x3c00, // 15360 or 46080 works
        };
        const burglarAlarm: KeyValue = {
            'OFF': 0x0001,
            'ON': 0xb401, // 46081
        };
        const exposes: Expose[] = [
            e.binary('smoke', ea.STATE, true, false).withDescription('Indicates whether the device detected smoke'),
            e.binary('test', ea.STATE, true, false).withDescription('Indicates whether the device is currently performing a test')
                .withCategory('diagnostic'),
            e.binary('alarm_smoke', ea.ALL, 'ON', 'OFF').withDescription('Toggle the smoke alarm siren').withCategory('config'),
            e.binary('alarm_burglar', ea.ALL, 'ON', 'OFF').withDescription('Toggle the burglar alarm siren').withCategory('config'),
        ];
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'ssIasZone',
            type: ['commandStatusChangeNotification', 'attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                if (msg.data.hasOwnProperty('zoneStatus') || msg.data.hasOwnProperty('zonestatus')) {
                    const zoneStatus = msg.type === 'commandStatusChangeNotification' ? msg.data.zonestatus : msg.data.zoneStatus;
                    return {
                        smoke: (zoneStatus & 1) > 0,
                        alarm_smoke: (zoneStatus & 1<<1) > 0,
                        battery_low: (zoneStatus & 1<<3) > 0,
                        supervision_reports: (zoneStatus & 1<<4) > 0,
                        restore_reports: (zoneStatus & 1<<5) > 0,
                        alarm_burglar: (zoneStatus & 1<<7) > 0,
                        test: (zoneStatus & 1<<8) > 0,
                        alarm_silenced: (zoneStatus & 1<<11) > 0,
                    };
                }
            },
        }];
        const toZigbee: Tz.Converter[] = [{
            key: ['alarm_smoke', 'alarm_burglar'],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'alarm_smoke') {
                    const index = utils.getFromLookup(value, smokeAlarm);
                    await entity.command('ssIasZone', 'boschSmokeAlarmSiren', {data: index}, manufacturerOpts);
                    return {state: {alarm_smoke: value}};
                }
                if (key === 'alarm_burglar') {
                    const index = utils.getFromLookup(value, burglarAlarm);
                    await entity.command('ssIasZone', 'boschSmokeAlarmSiren', {data: index}, manufacturerOpts);
                    return {state: {alarm_burglar: value}};
                }
            },
            convertGet: async (entity, key, meta) => {
                switch (key) {
                case 'alarm_smoke':
                case 'alarm_burglar':
                case 'zone_status':
                    await entity.read('ssIasZone', ['zoneStatus']);
                    break;
                default:
                    throw new Error(`Unhandled key boschExtend.smokeAlarm.toZigbee.convertGet ${key}`);
                }
            },
        }];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    broadcastAlarm: (): ModernExtend => {
        const sirenState: KeyValue = {
            'smoke_off': 0x0000,
            'smoke_on': 0x3c00,
            'burglar_off': 0x0001,
            'burglar_on': 0xb401,
        };
        const exposes: Expose[] = [
            e.enum('broadcast_alarm', ea.SET, Object.keys(sirenState))
                .withDescription('Set siren state of all BSD-2 via broadcast').withCategory('config'),
        ];
        const toZigbee: Tz.Converter[] = [{
            key: ['broadcast_alarm'],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'broadcast_alarm') {
                    const index = utils.getFromLookup(value, sirenState);
                    utils.assertEndpoint(entity);
                    await entity.zclCommandBroadcast(
                        255, ZSpec.BroadcastAddress.SLEEPY,
                        Zcl.Clusters.ssIasZone.ID, 'boschSmokeAlarmSiren',
                        {data: index}, manufacturerOpts,
                    );
                    return;
                }
            },
        }];
        return {
            exposes,
            toZigbee,
            isModernExtend: true,
        };
    },
    twinguard: (): ModernExtend => {
        const smokeSensitivity = {
            'low': 0x03,
            'medium': 0x02,
            'high': 0x01,
        };
        const sirenState = {
            'stop': 0x00,
            'pre_alarm': 0x01,
            'fire': 0x02,
            'burglar': 0x03,
        };
        const stateOffOn = {
            'OFF': 0x00,
            'ON': 0x01,
        };
        const exposes: Expose[] = [
            e.binary('smoke', ea.STATE, true, false).withDescription('Indicates whether the device detected smoke'),
            e.numeric('temperature', ea.STATE).withValueMin(0).withValueMax(65).withValueStep(0.1)
                .withUnit('°C').withDescription('Measured temperature value'),
            e.numeric('humidity', ea.STATE).withValueMin(0).withValueMax(100).withValueStep(0.1)
                .withUnit('%').withDescription('Measured relative humidity'),
            e.numeric('voc', ea.STATE).withValueMin(0).withValueMax(50000).withValueStep(1)
                .withLabel('VOC').withUnit('µg/m³').withDescription('Measured VOC value'),
            e.numeric('co2', ea.STATE).withValueMin(400).withValueMax(2400).withValueStep(1)
                .withLabel('CO2').withUnit('ppm').withDescription('The measured CO2 (carbon dioxide) value'),
            e.numeric('aqi', ea.STATE).withValueMin(0).withValueMax(500).withValueStep(1)
                .withLabel('AQI').withDescription('Air Quality Index'),
            e.numeric('illuminance_lux', ea.STATE).withUnit('lx')
                .withDescription('Measured illuminance in lux'),
            e.numeric('battery', ea.STATE).withUnit('%').withValueMin(0).withValueMax(100)
                .withDescription('Remaining battery in %').withCategory('diagnostic'),
            e.text('siren_state', ea.STATE)
                .withDescription('Siren state').withCategory('diagnostic'),
            e.enum('alarm', ea.ALL, Object.keys(sirenState)).withDescription('Alarm mode for siren'),
            e.binary('self_test', ea.ALL, true, false)
                .withDescription('Initiate self-test').withCategory('config'),
            e.enum('sensitivity', ea.ALL, Object.keys(smokeSensitivity))
                .withDescription('Sensitivity of the smoke detector').withCategory('config'),
            e.binary('pre_alarm', ea.ALL, 'ON', 'OFF')
                .withDescription('Enable/disable pre-alarm').withCategory('config'),
            e.binary('heartbeat', ea.ALL, 'ON', 'OFF')
                .withDescription('Enable/disable heartbeat (blue LED)').withCategory('config'),
        ];
        const fromZigbee: Fz.Converter[] = [{
            cluster: 'twinguardSmokeDetector',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('sensitivity')) {
                    result.sensitivity = (Object.keys(smokeSensitivity)[msg.data['sensitivity']]);
                }
                return result;
            },
        }, {
            cluster: 'twinguardMeasurements',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('humidity')) {
                    const humidity = utils.toNumber(msg.data['humidity']) / 100.0;
                    if (utils.isInRange(0, 100, humidity)) {
                        result.humidity = humidity;
                    }
                }
                if (msg.data.hasOwnProperty('airpurity')) {
                    const iaq = utils.toNumber(msg.data['airpurity']);
                    result.aqi = iaq;
                    let factorVoc = 6;
                    let factorCo2 = 2;
                    if ((iaq >= 51) && (iaq <= 100)) {
                        factorVoc = 10;
                        factorCo2 = 4;
                    } else if ((iaq >= 101) && (iaq <= 150)) {
                        factorVoc = 20;
                        factorCo2 = 4;
                    } else if ((iaq >= 151) && (iaq <= 200)) {
                        factorVoc = 50;
                        factorCo2 = 4;
                    } else if ((iaq >= 201) && (iaq <= 250)) {
                        factorVoc = 100;
                        factorCo2 = 4;
                    } else if (iaq >= 251) {
                        factorVoc = 100;
                        factorCo2 = 4;
                    }
                    result.voc = (iaq * factorVoc);
                    result.co2 = ((iaq * factorCo2) + 400);
                }
                if (msg.data.hasOwnProperty('temperature')) {
                    result.temperature = utils.toNumber(msg.data['temperature']) / 100.0;
                }
                if (msg.data.hasOwnProperty('illuminance_lux')) {
                    result.illuminance_lux = utils.precisionRound((msg.data['illuminance_lux'] / 2), 2);
                }
                if (msg.data.hasOwnProperty('battery')) {
                    result.battery = utils.precisionRound((msg.data['battery'] / 2), 2);
                }
                return result;
            },
        }, {
            cluster: 'twinguardOptions',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('pre_alarm')) {
                    result.pre_alarm = (Object.keys(stateOffOn)[msg.data['pre_alarm']]);
                }
                return result;
            },
        }, {
            cluster: 'twinguardSetup',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                if (msg.data.hasOwnProperty('heartbeat')) {
                    result.heartbeat = (Object.keys(stateOffOn)[msg.data['heartbeat']]);
                }
                return result;
            },
        }, {
            cluster: 'twinguardAlarm',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                const lookup: KeyValue = {
                    0x00200020: 'clear',
                    0x01200020: 'self_test',
                    0x02200020: 'burglar',
                    0x00200082: 'pre_alarm',
                    0x00200081: 'fire',
                    0x00200040: 'silenced',
                };
                if (msg.data.hasOwnProperty('alarm_status')) {
                    result.self_test = (msg.data['alarm_status'] & 1<<24) > 0;
                    result.smoke = (msg.data['alarm_status'] & 1<<7) > 0;
                    result.siren_state = lookup[msg.data['alarm_status']];
                }
                return result;
            },
        }, {
            cluster: 'genAlarms',
            type: ['commandAlarm', 'readResponse'],
            convert: async (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                const lookup: KeyValue = {
                    0x10: 'fire',
                    0x11: 'pre_alarm',
                    0x14: 'clear',
                    0x16: 'silenced',
                };
                result.siren_state = lookup[msg.data.alarmcode];
                if (msg.data.alarmcode == 0x10 || msg.data.alarmcode == 0x11) {
                    await msg.endpoint.commandResponse('genAlarms', 'alarm',
                        {alarmcode: msg.data.alarmcode, clusterid: 0xe000}, {direction: 1});
                }
                return result;
            },
        }];
        const toZigbee: Tz.Converter[] = [{
            key: ['sensitivity', 'pre_alarm', 'self_test', 'alarm', 'heartbeat'],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'sensitivity') {
                    const index = utils.getFromLookup(value, smokeSensitivity);
                    await entity.write('twinguardSmokeDetector', {sensitivity: index});
                    return {state: {sensitivity: value}};
                }
                if (key === 'pre_alarm') {
                    const index = utils.getFromLookup(value, stateOffOn);
                    await entity.write('twinguardOptions', {pre_alarm: index});
                    return {state: {pre_alarm: value}};
                }
                if (key === 'heartbeat') {
                    const endpoint = meta.device.getEndpoint(12);
                    const index = utils.getFromLookup(value, stateOffOn);
                    await endpoint.write('twinguardSetup', {heartbeat: index});
                    return {state: {heartbeat: value}};
                }
                if (key === 'self_test') {
                    if (value) {
                        await entity.command('twinguardSmokeDetector', 'initiateTestMode');
                    }
                }
                if (key === 'alarm') {
                    const endpoint = meta.device.getEndpoint(12);
                    const index = utils.getFromLookup(value, sirenState);
                    utils.assertEndpoint(entity);
                    if (index == 0x00) {
                        await entity.commandResponse('genAlarms', 'alarm', {alarmcode: 0x16, clusterid: 0xe000}, {direction: 1});
                        await entity.commandResponse('genAlarms', 'alarm', {alarmcode: 0x14, clusterid: 0xe000}, {direction: 1});
                        await endpoint.command('twinguardAlarm', 'burglarAlarm', {data: 0x00});
                    } else if (index == 0x01) {
                        await entity.commandResponse('genAlarms', 'alarm', {alarmcode: 0x11, clusterid: 0xe000}, {direction: 1});
                        return {state: {siren_state: 'pre_alarm'}};
                    } else if (index == 0x02) {
                        await entity.commandResponse('genAlarms', 'alarm', {alarmcode: 0x10, clusterid: 0xe000}, {direction: 1});
                        return {state: {siren_state: 'fire'}};
                    } else if (index == 0x03) {
                        await endpoint.command('twinguardAlarm', 'burglarAlarm', {data: 0x01});
                    }
                }
            },
            convertGet: async (entity, key, meta) => {
                switch (key) {
                case 'sensitivity':
                    await entity.read('twinguardSmokeDetector', ['sensitivity']);
                    break;
                case 'pre_alarm':
                    await entity.read('twinguardOptions', ['pre_alarm']);
                    break;
                case 'heartbeat':
                    await meta.device.getEndpoint(12).read('twinguardSetup', ['heartbeat']);
                    break;
                case 'alarm':
                case 'self_test':
                    await meta.device.getEndpoint(12).read('twinguardAlarm', ['alarm_status']);
                    break;
                default:
                    throw new Error(`Unhandled key boschExtend.twinguard.toZigbee.convertGet ${key}`);
                }
            },
        }];
        return {
            exposes,
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
    bmct: (): ModernExtend => {
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
        const stateOffOn = {
            'OFF': 0x00,
            'ON': 0x01,
        };
        const fromZigbee: Fz.Converter[] = [fz.on_off, fz.power_on_behavior, fz.cover_position_tilt, {
            cluster: 'boschSpecific',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const result: KeyValue = {};
                const data = msg.data;
                if (data.hasOwnProperty('deviceMode')) {
                    result.device_mode = Object.keys(stateDeviceMode).find((key) => stateDeviceMode[key] === msg.data['deviceMode']);
                    const deviceMode = msg.data['deviceMode'];
                    if (deviceMode !== meta.device.meta.deviceMode) {
                        meta.device.meta.deviceMode = deviceMode;
                        meta.deviceExposesChanged();
                    }
                }
                if (data.hasOwnProperty('switchType')) {
                    result.switch_type = Object.keys(stateSwitchType).find((key) => stateSwitchType[key] === msg.data['switchType']);
                }
                if (data.hasOwnProperty('calibrationOpeningTime')) {
                    result.calibration_opening_time = msg.data['calibrationOpeningTime'] / 10;
                }
                if (data.hasOwnProperty('calibrationClosingTime')) {
                    result.calibration_closing_time = msg.data['calibrationClosingTime'] / 10;
                }
                if (data.hasOwnProperty('calibrationButtonHoldTime')) {
                    result.calibration_button_hold_time = msg.data['calibrationButtonHoldTime'] / 10;
                }
                if (data.hasOwnProperty('calibrationMotorStartDelay')) {
                    result.calibration_motor_start_delay = msg.data['calibrationMotorStartDelay'] / 10;
                }
                if (data.hasOwnProperty('childLock')) {
                    const property = utils.postfixWithEndpointName('child_lock', msg, model, meta);
                    result[property] = msg.data['childLock'] === 1 ? 'ON' : 'OFF';
                }
                if (data.hasOwnProperty('motorState')) {
                    result.motor_state = Object.keys(stateMotor).find((key) => stateMotor[key] === msg.data['motorState']);
                }
                return result;
            },
        }];
        const toZigbee: Tz.Converter[] = [tz.power_on_behavior, tz.cover_position_tilt, {
            key: [
                'device_mode',
                'switch_type',
                'child_lock',
                'state',
                'on_time',
                'off_wait_time',
            ],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'state') {
                    if ('ID' in entity && entity.ID === 1) {
                        await tz.cover_state.convertSet(entity, key, value, meta);
                    } else {
                        await tz.on_off.convertSet(entity, key, value, meta);
                    }
                }
                if (key === 'on_time' || key === 'on_wait_time') {
                    if ('ID' in entity && entity.ID !== 1) {
                        await tz.on_off.convertSet(entity, key, value, meta);
                    }
                }
                if (key === 'device_mode') {
                    const index = utils.getFromLookup(value, stateDeviceMode);
                    await entity.write('boschSpecific', {deviceMode: index});
                    await entity.read('boschSpecific', ['deviceMode']);
                    return {state: {device_mode: value}};
                }
                if (key === 'switch_type') {
                    const index = utils.getFromLookup(value, stateSwitchType);
                    await entity.write('boschSpecific', {switchType: index});
                    return {state: {switch_type: value}};
                }
                if (key === 'child_lock') {
                    const index = utils.getFromLookup(value, stateOffOn);
                    await entity.write('boschSpecific', {childLock: index});
                    return {state: {child_lock: value}};
                }
            },
            convertGet: async (entity, key, meta) => {
                switch (key) {
                case 'state':
                case 'on_time':
                case 'off_wait_time':
                    if ('ID' in entity && entity.ID !== 1) {
                        await entity.read('genOnOff', ['onOff']);
                    }
                    break;
                case 'device_mode':
                    await entity.read('boschSpecific', ['deviceMode']);
                    break;
                case 'switch_type':
                    await entity.read('boschSpecific', ['switchType']);
                    break;
                case 'child_lock':
                    await entity.read('boschSpecific', ['childLock']);
                    break;
                default:
                    throw new Error(`Unhandled key boschExtend.bmct.toZigbee.convertGet ${key}`);
                }
            },
        }, {
            key: [
                'calibration_closing_time',
                'calibration_opening_time',
                'calibration_button_hold_time',
                'calibration_motor_start_delay',
            ],
            convertSet: async (entity, key, value, meta) => {
                if (key === 'calibration_opening_time') {
                    const number = utils.toNumber(value, 'calibration_opening_time');
                    const index = number * 10;
                    await entity.write('boschSpecific', {calibrationOpeningTime: index});
                    return {state: {calibration_opening_time: number}};
                }
                if (key === 'calibration_closing_time') {
                    const number = utils.toNumber(value, 'calibration_closing_time');
                    const index = number * 10;
                    await entity.write('boschSpecific', {calibrationClosingTime: index});
                    return {state: {calibration_closing_time: number}};
                }
                if (key === 'calibration_button_hold_time') {
                    const number = utils.toNumber(value, 'calibration_button_hold_time');
                    const index = number * 10;
                    await entity.write('boschSpecific', {calibrationButtonHoldTime: index});
                    return {state: {calibration_button_hold_time: number}};
                }
                if (key === 'calibration_motor_start_delay') {
                    const number = utils.toNumber(value, 'calibration_motor_start_delay');
                    const index = number * 10;
                    await entity.write('boschSpecific', {calibrationMotorStartDelay: index});
                    return {state: {calibration_motor_start_delay: number}};
                }
            },
            convertGet: async (entity, key, meta) => {
                switch (key) {
                case 'calibration_opening_time':
                    await entity.read('boschSpecific', ['calibrationOpeningTime']);
                    break;
                case 'calibration_closing_time':
                    await entity.read('boschSpecific', ['calibrationClosingTime']);
                    break;
                case 'calibration_button_hold_time':
                    await entity.read('boschSpecific', ['calibrationButtonHoldTime']);
                    break;
                case 'calibration_motor_start_delay':
                    await entity.read('boschSpecific', ['calibrationMotorStartDelay']);
                    break;
                default:
                    throw new Error(`Unhandled key boschExtend.bmct.toZigbee.convertGet ${key}`);
                }
            },
        }];
        return {
            fromZigbee,
            toZigbee,
            isModernExtend: true,
        };
    },
};
