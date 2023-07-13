import { VisRxWidget } from '@iobroker/vis-2-widgets-react-dev';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Switch,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import { useEffect, useState } from 'react';
import { ChannelDetector } from 'iobroker.type-detector';
import Generic from './Generic';
import { getDeviceWidget, getDeviceWidgetOnePage } from './deviceWidget';

const allObjects = async socket => {
    const states = await socket.getObjectView('', '\u9999', 'state');
    const channels = await socket.getObjectView('', '\u9999', 'channel');
    const devices = await socket.getObjectView('', '\u9999', 'device');
    const enums = await socket.getObjectView('', '\u9999', 'enum');

    return Object.values(states)
        .concat(Object.values(channels))
        .concat(Object.values(devices))
        .concat(Object.values(enums))
        // eslint-disable-next-line
        .reduce((obj, item) => (obj[item._id] = item, obj), {});
};

const detectDevice = async socket => {
    const devicesObject = await allObjects(socket);
    const keys = Object.keys(devicesObject).sort();
    const detector = new ChannelDetector();

    const usedIds = [];
    const ignoreIndicators = ['UNREACH_STICKY'];    // Ignore indicators by name
    const excludedTypes = ['info'];
    const enums = [];
    const rooms = [];
    const list = [];
    keys.forEach(id => {
        if (devicesObject[id]?.type === 'enum') {
            enums.push(id);
        } else if (devicesObject[id]?.common?.smartName) {
            list.push(id);
        }
    });

    enums.forEach(id => {
        if (id.startsWith('enum.rooms.')) {
            rooms.push(id);
        }
        const members = devicesObject[id].common.members;
        // console.log(id);
        if (members && members.length) {
            members.forEach(member => {
                if (devicesObject[member]) {
                    if (!list.includes(member)) {
                        list.push(member);
                    }
                }
            });
        }
    });

    const options = {
        objects: devicesObject,
        _keysOptional: keys,
        _usedIdsOptional: usedIds,
        ignoreIndicators,
        excludedTypes,
    };
    const result = [];
    // console.log(rooms);
    rooms.forEach(roomId => {
        const room = devicesObject[roomId];
        const roomObject = {
            ...room,
            devices: [],
        };
        // console.log(room.common.members);
        room.common.members.forEach(member => {
            const deviceObject = {
                ...devicesObject[member],
                states: [],
            };
            options.id = member;
            const controls = detector.detect(options);
            console.log(controls);
            if (controls) {
                controls.forEach(control => {
                    if (!deviceObject.deviceType) {
                        deviceObject.deviceType = control.type;
                    }
                    if (control.states) {
                        control.states.forEach(state => {
                            if (state.id) {
                                // console.log(state);
                                deviceObject.states.push(devicesObject[state.id]);
                            }
                        });
                    }
                });
            }
            roomObject.devices.push(deviceObject);
        });
        result.push(roomObject);
    });

    return result;
};

const getNewWidgetIdNumber = project => {
    const widgets = [];
    Object.keys(project).forEach(view =>
        project[view].widgets && Object.keys(project[view].widgets).forEach(widget =>
            widgets.push(widget)));
    let newKey = 1;
    widgets.forEach(name => {
        const matches = name.match(/^w([0-9]+)$/);
        if (matches) {
            const num = parseInt(matches[1], 10);
            if (num >= newKey) {
                newKey = num + 1;
            }
        }
    });

    return newKey;
};

const WizardDialog = props => {
    const [states, setStates] = useState(null);
    const [checked, setChecked] = useState({});
    const [devicesChecked, setDevicesChecked] = useState({});
    const [roomsChecked, setRoomsChecked] = useState({});
    const [onePage, setOnePage] = useState(false);

    useEffect(() => {
        (async () => {
            const _states = await detectDevice(props.socket);
            console.log(_states);
            setStates(_states);
            const _checked = {};
            const _devicesChecked = {};
            const _roomsChecked = {};
            _states.forEach(room => {
                _roomsChecked[room._id] = true;
                room.devices.forEach(device => {
                    _devicesChecked[device._id] = true;
                    device.states.forEach(state => {
                        _checked[state._id] = true;
                    });
                });
            });
            setChecked(_checked);
            setDevicesChecked(_devicesChecked);
            setRoomsChecked(_roomsChecked);
        })();
    }, [props.open, props.socket]);

    const handleSubmit = () => {
        const project = JSON.parse(JSON.stringify(props.project));
        let newKey = getNewWidgetIdNumber(project);
        states.forEach(room => {
            if (!roomsChecked[room._id]) {
                return;
            }
            let roomHeight = 0;
            let viewId = Generic.getText(room.common.name);
            let roomWidget;
            if (onePage) {
                roomWidget = {
                    tpl: 'tplMaterial2Switches',
                    data: {
                        widgetTitle: Generic.getText(room.common.name),
                        count: 0,
                        g_common: true,
                        type: 'lines',
                        allSwitch: false,
                        buttonsWidth: 120,
                        buttonsHeight: 80,
                    },
                    style: {
                        left: '0px',
                        top: '0px',
                        width: '100%',
                        height: 120,
                        position: 'relative',
                    },
                    wizard: {
                        id: room._id,
                    },
                };
                viewId = props.selectedView;
            } else {
                const projectView = Object.keys(project).find(view => project[view].wizard?.id === room._id);
                if (projectView) {
                    viewId = projectView;
                } else if (project[viewId]) {
                    project[viewId].wizard = {
                        id: room._id,
                    };
                } else {
                    project[viewId] = {
                        name: Generic.getText(room.common.name),
                        parentId: null,
                        settings: {
                            style: {},
                        },
                        widgets: {},
                        activeWidgets: {},
                        wizard: {
                            id: room._id,
                        },
                    };
                }
            }
            room.devices.forEach(device => {
                if (!devicesChecked[device._id]) {
                    return;
                }
                // console.log(device);
                let widgetId = `w${newKey.toString().padStart(6, 0)}`;

                let widget;
                const projectWidget = Object.keys(project[viewId].widgets).find(_widget => project[viewId].widgets[_widget].wizard?.id === device._id);
                if (projectWidget) {
                    widget = project[viewId].widgets[projectWidget];
                    widgetId = projectWidget;
                    widget.data = { ...widget.data, ...getDeviceWidget(device).data };
                } else {
                    widget = getDeviceWidget(device);
                }
                roomHeight += widget.style.height;
                if (onePage) {
                    getDeviceWidgetOnePage(device, widgetId, roomWidget, project[viewId]);
                    // widget.usedInWidget = true;
                    // project[viewId].widgets[widgetId] = widget;
                } else {
                    project[viewId].widgets[widgetId] = widget;
                }
                newKey++;
            });
            if (onePage) {
                roomWidget.style.height = roomHeight + 90;
                const projectRoomWidget = Object.keys(project[props.selectedView].widgets).find(_widget => project[props.selectedView].widgets[_widget].wizard?.id === room._id);
                if (projectRoomWidget) {
                    project[props.selectedView].widgets[projectRoomWidget] =
                    { ...project[props.selectedView].widgets[projectRoomWidget], ...roomWidget };
                } else {
                    const roomWidgetId = `w${newKey.toString().padStart(6, 0)}`;
                    project[props.selectedView].widgets[roomWidgetId] = roomWidget;
                    newKey++;
                }
            }
        });
        props.changeProject(project);
        props.onClose();
    };

    return <Dialog
        key="materialWizardDialog"
        open={!0}
        onClose={props.onClose}
        fullWidth
    >
        <DialogTitle>{Generic.t('Wizard')}</DialogTitle>
        <DialogContent>
            {states ? <>
                <div>
                    <Switch checked={onePage} onChange={e => setOnePage(e.target.checked)} />
                    {Generic.t('One page')}
                </div>
                {
                    states.map(room => <div key={room._id}>
                        <Accordion defaultExpanded>
                            <AccordionSummary expandIcon={<ExpandMore />}>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <Checkbox
                                        checked={roomsChecked[room._id]}
                                        onChange={e => {
                                            const _roomsChecked = JSON.parse(JSON.stringify(roomsChecked));
                                            _roomsChecked[room._id] = e.target.checked;
                                            setRoomsChecked(_roomsChecked);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                    {Generic.getText(room.common.name)}
                                </div>
                            </AccordionSummary>
                            <AccordionDetails>
                                {roomsChecked[room._id] ? room.devices.map(device => <div key={device._id}>
                                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 20 }}>
                                        <Checkbox
                                            checked={devicesChecked[device._id]}
                                            onChange={e => {
                                                const _devicesChecked = JSON.parse(JSON.stringify(devicesChecked));
                                                _devicesChecked[device._id] = e.target.checked;
                                                setDevicesChecked(_devicesChecked);
                                            }}
                                            onClick={e => e.stopPropagation()}
                                        />
                                        {Generic.getText(device.common.name)}
                                    </div>
                                </div>) : null}
                            </AccordionDetails>
                        </Accordion>
                    </div>)
                }
            </> : <LinearProgress />}
        </DialogContent>
        <DialogActions>
            <Button
                variant="contained"
                onClick={() => props.onClose()}
                color="grey"
            >
                {Generic.t('Cancel')}
            </Button>
            <Button
                variant="contained"
                onClick={handleSubmit}
            >
                {Generic.t('Add views')}
            </Button>
        </DialogActions>
    </Dialog>;
};

const WizardIcon = () => <svg
    stroke="currentColor"
    fill="none"
    strokeWidth="0"
    viewBox="0 0 15 15"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
>
    <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M13.9 0.499976C13.9 0.279062 13.7209 0.0999756 13.5 0.0999756C13.2791 0.0999756 13.1 0.279062 13.1 0.499976V1.09998H12.5C12.2791 1.09998 12.1 1.27906 12.1 1.49998C12.1 1.72089 12.2791 1.89998 12.5 1.89998H13.1V2.49998C13.1 2.72089 13.2791 2.89998 13.5 2.89998C13.7209 2.89998 13.9 2.72089 13.9 2.49998V1.89998H14.5C14.7209 1.89998 14.9 1.72089 14.9 1.49998C14.9 1.27906 14.7209 1.09998 14.5 1.09998H13.9V0.499976ZM11.8536 3.14642C12.0488 3.34168 12.0488 3.65826 11.8536 3.85353L10.8536 4.85353C10.6583 5.04879 10.3417 5.04879 10.1465 4.85353C9.9512 4.65827 9.9512 4.34169 10.1465 4.14642L11.1464 3.14643C11.3417 2.95116 11.6583 2.95116 11.8536 3.14642ZM9.85357 5.14642C10.0488 5.34168 10.0488 5.65827 9.85357 5.85353L2.85355 12.8535C2.65829 13.0488 2.34171 13.0488 2.14645 12.8535C1.95118 12.6583 1.95118 12.3417 2.14645 12.1464L9.14646 5.14642C9.34172 4.95116 9.65831 4.95116 9.85357 5.14642ZM13.5 5.09998C13.7209 5.09998 13.9 5.27906 13.9 5.49998V6.09998H14.5C14.7209 6.09998 14.9 6.27906 14.9 6.49998C14.9 6.72089 14.7209 6.89998 14.5 6.89998H13.9V7.49998C13.9 7.72089 13.7209 7.89998 13.5 7.89998C13.2791 7.89998 13.1 7.72089 13.1 7.49998V6.89998H12.5C12.2791 6.89998 12.1 6.72089 12.1 6.49998C12.1 6.27906 12.2791 6.09998 12.5 6.09998H13.1V5.49998C13.1 5.27906 13.2791 5.09998 13.5 5.09998ZM8.90002 0.499976C8.90002 0.279062 8.72093 0.0999756 8.50002 0.0999756C8.2791 0.0999756 8.10002 0.279062 8.10002 0.499976V1.09998H7.50002C7.2791 1.09998 7.10002 1.27906 7.10002 1.49998C7.10002 1.72089 7.2791 1.89998 7.50002 1.89998H8.10002V2.49998C8.10002 2.72089 8.2791 2.89998 8.50002 2.89998C8.72093 2.89998 8.90002 2.72089 8.90002 2.49998V1.89998H9.50002C9.72093 1.89998 9.90002 1.72089 9.90002 1.49998C9.90002 1.27906 9.72093 1.09998 9.50002 1.09998H8.90002V0.499976Z"
        fill="currentColor"
    />
</svg>;

const WizardButton = props => {
    const [open, setOpen] = useState(false);

    return [
        <Button
            key="materialWizardButton"
            onClick={() => setOpen(true)}
            variant="contained"
            startIcon={<WizardIcon />}
        >
            {Generic.t('Wizard')}
        </Button>,
        open ? <WizardDialog
            key="materialWizardDialog"
            onClose={() => setOpen(false)}
            {...props}
        /> : null,
    ];
};

class Wizard extends (window.visRxWidget || VisRxWidget) {
    static getWidgetInfo() {
        return {
            id: 'tplMaterial2Wizard',
            visSet: 'vis-2-widgets-material',
            visName: 'Wizard',
            visWidgetLabel: 'wizard',
            visPrev: 'widgets/vis-2-widgets-material/img/prev_wizard.png',
            visOrder: 100,
            custom: true,
            customPalette: data => <WizardButton {...data} />,
        };
    }
}

export default Wizard;
