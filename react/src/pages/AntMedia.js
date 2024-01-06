import React, { useEffect, useState } from "react";
import { Grid, CircularProgress, Box } from "@mui/material";
import { useParams } from "react-router-dom";
import WaitingRoom from "./WaitingRoom";
import _ from "lodash";
import MeetingRoom from "./MeetingRoom";
import MessageDrawer from "Components/MessageDrawer";
import { useSnackbar } from "notistack";
import { SnackbarProvider } from "notistack";
import AntSnackBar from "Components/AntSnackBar";
import LeftTheRoom from "./LeftTheRoom";
import { useBeforeUnload } from "react-router-dom";
import { WebRTCAdaptor } from "@antmedia/webrtc_adaptor";
import { VideoEffect } from "@antmedia/webrtc_adaptor";

import { getUrlParameter } from "@antmedia/webrtc_adaptor";
import { SvgIcon } from "../Components/SvgIcon";
import ParticipantListDrawer from "../Components/ParticipantListDrawer";

import {getRoomNameAttribute, getRootAttribute, getWebSocketURLAttribute} from "../utils.js";
import floating from "../external/floating.js";
import {useTranslation} from "react-i18next";
import PublisherRequestListDrawer from "../Components/PublisherRequestListDrawer";

export const ConferenceContext = React.createContext(null);

const globals = {
  //this settings is to keep consistent with the sdk until backend for the app is setup
  // maxVideoTrackCount is the tracks i can see excluding my own local video.so the use is actually seeing 3 videos when their own local video is included.
  maxVideoTrackCount: 60,
  trackEvents: [],
};

const JoinModes = {
  MULTITRACK: "multitrack",
  MCU: "mcu"
}

function getPlayToken() {
  const dataPlayToken = document.getElementById("root").getAttribute("data-play-token");
  return (dataPlayToken) ? dataPlayToken : getUrlParameter("playToken");
}

function getPublishToken() {
  const dataPublishToken = document.getElementById("root").getAttribute("data-publish-token");
  return (dataPublishToken) ? dataPublishToken : getUrlParameter("publishToken");
}

var playToken = getPlayToken();
var publishToken = getPublishToken();
var mcuEnabled = getUrlParameter("mcuEnabled");
var subscriberId = getUrlParameter("subscriberId");
var subscriberCode = getUrlParameter("subscriberCode");
var scrollThreshold = -Infinity;
var scroll_down = true;
var last_warning_time = null;
let makeOnlyDataChannelPublisher = false;
let makePublisherOnlyDataChannel = false;

var videoQualityConstraints = {
    video: {
        width: {ideal: 640}, height: {ideal: 360},
        advanced: [
            {frameRate: {min: 15}}, {height: {min: 360}}, {width: {min: 640}}, {frameRate: {max: 15}}, {width: {max: 640}}, {height: {max: 360}}, {aspectRatio: {exact: 1.77778}}
        ]
    },
};

var audioQualityConstraints = {
  audio: {
    noiseSuppression: true,
    echoCancellation: true
  }
};

var mediaConstraints = {
  // setting constraints here breaks source switching on firefox.
  video: videoQualityConstraints.video,
  audio: audioQualityConstraints.audio,
};

if (localStorage.getItem('selectedCamera')) {
    mediaConstraints.video.deviceId = localStorage.getItem('selectedCamera');
}

if (localStorage.getItem('selectedMicrophone')) {
    mediaConstraints.audio.deviceId = localStorage.getItem('selectedMicrophone');
}

let websocketURL = process.env.REACT_APP_WEBSOCKET_URL;
let restBaseUrl = process.env.REACT_APP_REST_BASE_URL;

if (!websocketURL) {

  websocketURL = getWebSocketURLAttribute();

  if (!websocketURL) {
    const appName = window.location.pathname.substring(
      0,
      window.location.pathname.lastIndexOf("/") + 1
    );
    const path =
      window.location.hostname +
      ":" +
      window.location.port +
      appName +
      "websocket";
    websocketURL = "ws://" + path;

    if (window.location.protocol.startsWith("https")) {
      websocketURL = "wss://" + path;
    }
      restBaseUrl = window.location.protocol + "//" + path;
  }
  else {
      restBaseUrl = websocketURL.replace("ws", "http");
      //if it's wss, then it becomes https
  }
    restBaseUrl = restBaseUrl.replace("websocket", "");

    //remove last slash
    if (restBaseUrl.endsWith("/")) {
      restBaseUrl = restBaseUrl.substring(0, restBaseUrl.length - 1);
    }

}

var fullScreenId = -1;

var InitialStreamId = getRootAttribute("publish-stream-id");
if (!InitialStreamId) {
  InitialStreamId = getUrlParameter("streamId");
}

var admin = getRootAttribute("admin");
if (!admin) {
  admin = getUrlParameter("admin");
}

var onlyDataChannel = getRootAttribute("only-data-channel");
if (!onlyDataChannel) {
  onlyDataChannel = getUrlParameter("onlyDataChannel");
}

if (mcuEnabled == null) {
  mcuEnabled = false;
}

var playOnly = getRootAttribute("play-only");
if (!playOnly) {
  playOnly = getUrlParameter("playOnly");
}

playOnly = onlyDataChannel;

if (playOnly == null || typeof playOnly === "undefined") {
  playOnly = false;
}

if (playToken == null || typeof playToken === "undefined") {
  playToken = "";
}

if (publishToken == null || typeof publishToken === "undefined") {
  publishToken = "";
}

var tokenPublishAdmin = getRootAttribute("token-publish-admin");
if (!tokenPublishAdmin) {
    tokenPublishAdmin = getUrlParameter("tokenPublishAdmin");
}

var tokenPlay = getRootAttribute("token-play");
if (!tokenPlay) {
  tokenPlay = getUrlParameter("tokenPlay");
}

var tokenPublish = getRootAttribute("token-publish");
if (!tokenPublish) {
  tokenPublish = getUrlParameter("tokenPublish");
}


var roomOfStream = [];

var audioListenerIntervalJob = null;


var room = null;
var reconnecting = false;
var publishReconnected;
var playReconnected;

function AntMedia() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const {t} = useTranslation();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const id = (getRoomNameAttribute()) ? getRoomNameAttribute() : useParams().id;
  var roomName = id;

    // drawerOpen for message components.
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);

  // drawerOpen for participant list components.
  const [participantListDrawerOpen, setParticipantListDrawerOpen] = useState(false);

  const [publisherRequestListDrawerOpen, setPublisherRequestListDrawerOpen] = useState(false);

  const [publishStreamId, setPublishStreamId] = useState(InitialStreamId);

  // this is my own name when i enter the room.
  const [streamName, setStreamName] = useState(getRootAttribute("stream-name"));

  // this is for checking if i am sharing my screen with other participants.
  const [isScreenShared, setIsScreenShared] = useState(false);

  // this is for checking if my local camera is turned off.
  const [isMyCamTurnedOff, setIsMyCamTurnedOff] = useState(false);

  // this is for checking if my local mic is turned off.
  const [isMyMicMuted, setIsMyMicMuted] = useState(false);

  //we are going to store number of unread messages to display on screen if user has not opened message component.
  const [numberOfUnReadMessages, setNumberOfUnReadMessages] = useState(0);

  // pinned screen this could be by you or by shared screen.
  const [pinnedVideoId, setPinnedVideoId] = useState();

  // hide or show the emoji reaction component.
  const [showEmojis, setShowEmojis] = React.useState(false);

  // open or close the mute participant dialog.
  const [isMuteParticipantDialogOpen, setMuteParticipantDialogOpen] = React.useState(false);

  // set participant id you wanted to mute.
  const [participantIdMuted, setParticipantIdMuted] = React.useState({streamName: "", streamId: ""});

  // this one just triggers the re-rendering of the component.
  const [participantUpdated, setParticipantUpdated] = useState(false);

  const [roomJoinMode, setRoomJoinMode] = useState(JoinModes.MULTITRACK);

  const [screenSharedVideoId, setScreenSharedVideoId] = useState(null);
  const [waitingOrMeetingRoom, setWaitingOrMeetingRoom] = useState("waiting");
  const [leftTheRoom, setLeftTheRoom] = useState(false);

  const [isListener, setIsListener] = useState(playOnly);

  const [isAdmin, setIsAdmin] = useState(admin);

  const [videoTrackAssignmentListReceived, setVideoTrackAssignmentListReceived] = useState(false);

  const [isFakeeh, setIsFakeeh] = useState(true);

  const [reactions] = useState({
    'sparkling_heart': '💖',
    'thumbs_up': '👍🏼',
    'party_popper': '🎉',
    'clapping_hands': '👏🏼',
    'face_with_tears_of_joy': '😂',
    'open_mouth': '😮',
    'sad_face': '😢',
    'thinking_face': '🤔',
    'thumbs_down': '👎🏼'
  });

  /*
   * participants: is a list of participant tracks to which videoTracks (video players on the screen)
   * are assigned. This matches participants with the video players on the screen.
   *
   * This list is set partially in 3 places:
   * 1. in handlePlayVideo where a new track added to WebRTC.
   * Here a new participant structure is created and added the participants
   * 2. broadcastObject callback (which is return of getBroadcastObject request) for a participant
   * Here we get the name of the participant and set it.
   * 3. videoTrackAssignment (DC message):
   * Here we change the assigned participant video to video player according to the assginments we got.
   */
  const [participants, setParticipants] = useState([]);

  /*
   * allParticipants: is a dictionary of (streamId, broadcastObject) for all participants in the room.
   * It determines the participants list in the participants drawer.
   * broadcastObject callback (which is return of getBroadcastObject request) for roomName has subtrackList and
   * we use it to fill this dictionary.
   */
  const [allParticipants, setAllParticipants] = useState({});

  const [audioTracks, setAudioTracks] = useState([]);

  const [talkers, setTalkers] = useState([]);
  const [isPublished, setIsPublished] = useState(false);
  const [isPlayStarted, setIsPlayStarted] = useState(false);
  const [selectedCamera, setSelectedCamera] = React.useState(localStorage.getItem('selectedCamera'));
  const [selectedMicrophone, setSelectedMicrophone] = React.useState(localStorage.getItem('selectedMicrophone'));
  const [selectedBackgroundMode, setSelectedBackgroundMode] = React.useState("");
  const [isVideoEffectRunning, setIsVideoEffectRunning] = React.useState(false);
  const [virtualBackground, setVirtualBackground] = React.useState(null);
  const timeoutRef = React.useRef(null);
  const [presenters, setPresenters] = useState([]);
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [fakeParticipantCounter, setFakeParticipantCounter] = React.useState(1);

  const [devices, setDevices] = React.useState([]);

  const [isPlayOnly] = React.useState(playOnly);

  const [localVideo, setLocalVideoLocal] = React.useState(null);

  const [webRTCAdaptor, setWebRTCAdaptor] = React.useState();
  const [initialized, setInitialized] = React.useState(false);
  const [recreateAdaptor, setRecreateAdaptor] = React.useState(true);
  const [closeScreenShare, setCloseScreenShare] = React.useState(false);

    const [openRequestBecomeSpeakerDialog, setOpenRequestBecomeSpeakerDialog] = React.useState(false);
    const [requestingSpeakerName] = React.useState("");
    const [requestSpeakerList, setRequestSpeakerList] = React.useState([]);
    const [approvedSpeakerRequestList, setApprovedSpeakerRequestList] = React.useState([]);
    const [isBroadcasting, setIsBroadcasting] = React.useState(false);

    const [messages, setMessages] = useState([]);

    const [presenterButtonDisabled, setPresenterButtonDisabled] = useState(false);

    // video send resolution for publishing
    // possible values: "auto", "highDefinition", "standartDefinition", "lowDefinition"
    const [videoSendResolution, setVideoSendResolution] = React.useState(localStorage.getItem("videoSendResolution") ? localStorage.getItem("videoSendResolution") : "auto");

    React.useEffect(() => {
      if(presenterButtonDisabled === true) {
        setTimeout(() => {
          setPresenterButtonDisabled(false);
        }, 2000);
      }
    }, [presenterButtonDisabled]);

    function makeParticipantPresenter(id) {
        setPresenterButtonDisabled(true);
        let streamId = id;
        if (streamId === 'localVideo' && publishStreamId !== null) {
            streamId = publishStreamId;
        }

        const baseUrl = restBaseUrl;
        const requestOptions0 = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
        };

        const requestOptions1 = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };

        fetch( baseUrl+ "/rest/v2/broadcasts/conference-rooms/" + roomName + "listener/add?streamId=" + streamId, requestOptions0).then(
            () => {
                fetch(baseUrl + "/rest/v2/broadcasts/" + roomName + "listener/subtrack?id=" + streamId, requestOptions1)
                    .then((response) => { return response.json(); })
                    .then((data) => {
                      setPresenterButtonDisabled(false);
                        presenters.push(streamId);
                        var newPresenters = [...presenters];
                        setPresenters(newPresenters);

                        if (data.success) {

                            enqueueSnackbar({
                                message: t('Speaker has joined to the presenter room successfully'),
                                variant: 'info',
                            }, {
                                autoHideDuration: 1500,
                            });
                        }
                        else
                        {
                            enqueueSnackbar({
                                message: t('Speaker cannot joined to the presenter room. The error is "' + data.message + "'"),
                                variant: 'info',
                            }, {
                                autoHideDuration: 1500,
                            });
                        }

                        let command = {
                            "eventType": "BROADCAST_ON",
                            "streamId": streamId,
                        }
                        const requestOptions = {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(command)
                        };

                        fetch( baseUrl+ "/rest/v2/broadcasts/" + roomName + "/data", requestOptions)
                            .then((response) => { return response.json(); })
                            .then((data) => {
                                if (!data.success) {
                                    console.error("Data: " , command , " cannot be sent. The error is " + data.message);
                                }

                            });
                    });
            }
        )
    }

    function rejectSpeakerRequest(streamId) {
        let command = {
            "eventType": "REJECT_SPEAKER_REQUEST",
            "streamId": streamId,
        }
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        };
        fetch( restBaseUrl+ "/rest/v2/broadcasts/" + streamId + "/data", requestOptions).then(() => {});
    }

    function approveBecomeSpeakerRequest(requestingSpeakerName) {
        setOpenRequestBecomeSpeakerDialog(false);

        const baseUrl = restBaseUrl;

        let command = {
            "eventType": "GRANT_BECOME_PUBLISHER",
            "streamId": requestingSpeakerName,
        }
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        };
        fetch( baseUrl+ "/rest/v2/broadcasts/" + requestingSpeakerName + "/data", requestOptions).then(() => {});
        approvedSpeakerRequestList.push(requestingSpeakerName+"tempPublisher");
        var newList = [...approvedSpeakerRequestList]
        setApprovedSpeakerRequestList(newList);
    }

    function makeListenerAgain(speakerName) {

        const baseUrl = restBaseUrl;
        let command = {
            "eventType": "MAKE_LISTENER_AGAIN",
            "streamId": speakerName,
        }
        const requestOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(command)
        };
        fetch( baseUrl+ "/rest/v2/broadcasts/" + speakerName + "/data", requestOptions).then(() => {});
        // remove speakerName from approvedSpeakerRequestList
        let index = approvedSpeakerRequestList.indexOf(speakerName);
        if (index > -1) {
            approvedSpeakerRequestList.splice(index, 1);
        }
        var newList = [...approvedSpeakerRequestList]
        setApprovedSpeakerRequestList(newList);
    }

    function resetAllParticipants() {
        setAllParticipants([]);
    }

    function getAllParticipants() {
        return allParticipants;
    }

    function resetPartipants() {
        setParticipants([]);
    }

    function changeRoomName(roomNameParam) {
        roomName = roomNameParam;
    }

    function addBecomingPublisherRequest(listenerName)
    {
        let listener = {"streamId": listenerName};
        if (requestSpeakerList.find((l) => l.streamId === listenerName)) {
            return;
        }

        requestSpeakerList.push(listener);
        //we just need to change the reference of the array to trigger the re-render.
        var newRequestSpeakerList = [...requestSpeakerList];
        setRequestSpeakerList(newRequestSpeakerList);

    }

    function displayNoVideoAudioDeviceFoundWarning() {
        enqueueSnackbar(
            {
                message: "No video or audio device found. You cannot become publisher.",
                variant: "warning",
                icon: <SvgIcon size={24} name={'report'} color="red" />
            },
            {
                autoHideDuration: 5000,
                anchorOrigin: {
                    vertical: "top",
                    horizontal: "right",
                },
            }
        );
    }

    function makeParticipantUndoPresenter(id) {
      setPresenterButtonDisabled(true);
        let streamId = id;
        if (streamId === 'localVideo') {
            streamId = publishStreamId;
        }

        const baseUrl = restBaseUrl;
        const requestOptions0 = {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
        };
        const requestOptions2 = {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        };

        fetch(baseUrl + "/rest/v2/broadcasts/" + roomName + "listener/subtrack?id=" + streamId, requestOptions2).then((response) => response.json()).then((result) => {

            console.log("make participant undo presenter result: " + result.success);

            //update the mainTrack Id again because remove track cannot set the mainTrackId to old value
            var options = {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mainTrackStreamId: roomName,
                    metaData: allParticipants[streamId].metaData
                })
            };

            fetch(baseUrl + "/rest/v2/broadcasts/" + streamId, options).then((response) => response.json()).then((result) =>
            {
                console.log("update subtrack result: " + result.success + " for stream: " + streamId);

                fetch( baseUrl+ "/rest/v2/broadcasts/conference-rooms/" + roomName + "listener/delete?streamId=" + streamId, requestOptions0).then(() => {
                  setPresenterButtonDisabled(false);
                    presenters.splice(presenters.indexOf(streamId), 1);
                    var newPresenters = [...presenters];
                    setPresenters(newPresenters);
                  let command = {
                    "eventType": "STOP_PLAYING",
                    "streamId": streamId,
                  }
                  const requestOptions = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(command)
                  };
                  fetch( baseUrl+ "/rest/v2/broadcasts/" + streamId + "/data", requestOptions).then(() => {});
                    let command2 = {
                        "eventType": "BROADCAST_OFF",
                        "streamId": streamId,
                    }
                    const requestOptions2 = {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(command2)
                    };
                    fetch( baseUrl+ "/rest/v2/broadcasts/" + roomName + "/data", requestOptions2).then(() => {});
                });
            });


        });
    }

    function handleSendMessageAdmin(message) {
        if (publishStreamId) {
            let iceState = webRTCAdaptor.iceConnectionState(publishStreamId);
            if (
                iceState !== null &&
                iceState !== "failed" &&
                iceState !== "disconnected"
            ) {
                let commandList = message.split('*');
                if (commandList.length > 3 && commandList[0] === "admin" && admin && admin === true) {
                    if (commandList[1] === "publisher_room") {
                        webRTCAdaptor.sendData(publishStreamId,
                            JSON.stringify({
                                streamId: commandList[2],
                                eventType: commandList[3]
                            }));
                    }
                }
            }
        }
    }

    useEffect(() => {
        checkAndUpdateVideoAudioSources();
    }, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        updateVideoSendResolution(pinnedVideoId === "localVideo");
        localStorage.setItem('videoSendResolution', videoSendResolution);
    }, [videoSendResolution, isScreenShared, pinnedVideoId]);  // eslint-disable-line react-hooks/exhaustive-deps

    function makeFullScreen(divId) {
    if (fullScreenId === divId) {
      document.getElementById(divId).classList.remove("selected");
      document.getElementById(divId).classList.add("unselected");
      fullScreenId = -1;
    } else {
      document.getElementsByClassName("publisher-content")[0].className =
        "publisher-content chat-active fullscreen-layout";
      if (fullScreenId !== -1) {
        document.getElementById(fullScreenId).classList.remove("selected");
        document.getElementById(fullScreenId).classList.add("unselected");
      }
      document.getElementById(divId).classList.remove("unselected");
      document.getElementById(divId).classList.add("selected");
      fullScreenId = divId;
    }
  }


  function checkAndUpdateVideoAudioSources() {
    let isVideoDeviceAvailable = false;
    let isAudioDeviceAvailable = false;
    let selectedDevices = getSelectedDevices();
    let currentCameraDeviceId = selectedDevices.videoDeviceId;
    let currentAudioDeviceId = selectedDevices.audioDeviceId;

    // check if the selected devices are still available
    for (let index = 0; index < devices.length; index++) {
      if (devices[index].kind === "videoinput" && devices[index].deviceId === selectedDevices.videoDeviceId) {
        isVideoDeviceAvailable = true;
      }
      if (devices[index].kind === "audioinput" && devices[index].deviceId === selectedDevices.audioDeviceId) {
        isAudioDeviceAvailable = true;
      }
    }

    // if the selected devices are not available, select the first available device
    if (selectedDevices.videoDeviceId === '' || isVideoDeviceAvailable === false) {
      const camera = devices.find(d => d.kind === 'videoinput');
      if (camera) {
        selectedDevices.videoDeviceId = camera.deviceId;
      }
    }
    if (selectedDevices.audioDeviceId === '' || isAudioDeviceAvailable === false) {
      const audio = devices.find(d => d.kind === 'audioinput');
      if (audio) {
        selectedDevices.audioDeviceId = audio.deviceId;
      }
    }

    setSelectedDevices(selectedDevices);

    if (webRTCAdaptor !== null && currentCameraDeviceId !== selectedDevices.videoDeviceId && typeof publishStreamId != 'undefined') {
      webRTCAdaptor.switchVideoCameraCapture(publishStreamId, selectedDevices.videoDeviceId);
    }
    if (webRTCAdaptor !== null && (currentAudioDeviceId !== selectedDevices.audioDeviceId || selectedDevices.audioDeviceId === 'default') && typeof publishStreamId != 'undefined') {
      webRTCAdaptor.switchAudioInputSource(publishStreamId, selectedDevices.audioDeviceId);
    }
  }

  function reconnectionInProgress() {
      console.log("entering reconnectionInProgress");
    //reset UI releated states
    removeAllRemoteParticipants();

    reconnecting = true;
    publishReconnected = false;
    playReconnected = false;

    displayWarning("Connection lost. Trying reconnect...");
  }

  function joinRoom(roomName, generatedStreamId, roomJoinMode) {
    room = roomName;
    roomOfStream[generatedStreamId] = room;

    globals.maxVideoTrackCount = 60; //FIXME
    setPublishStreamId(generatedStreamId);

    if (playOnly) {
      webRTCAdaptor.play(roomName, playToken, roomName, null, subscriberId, subscriberCode);
    } else {
      handlePublish(
        generatedStreamId,
        publishToken,
        subscriberId,
        subscriberCode
      );
    }

  }

  async function checkDevices() {
    let devices = await navigator.mediaDevices.enumerateDevices();
    let audioDeviceAvailable = false
    let videoDeviceAvailable = false
    devices.forEach(device => {
      if (device.kind === "audioinput") {
        audioDeviceAvailable = true;
      }
      if (device.kind === "videoinput") {
        videoDeviceAvailable = true;
      }
    });

    if (!audioDeviceAvailable) {
      mediaConstraints.audio = false;
    }
    if (!videoDeviceAvailable) {
      mediaConstraints.video = false;
    }
  }

  // After the pr below merged, we can remove this function and
  // use the one in the webrtc_adaptor.js
  // https://github.com/ant-media/StreamApp/pull/427
  // Mustafa 06.01.2024
  function getVideoTrackAssignments(streamId) {
    var jsCmd = {
      streamId: streamId,
      command: "getVideoTrackAssignmentsCommand"
    };

    webRTCAdaptor.webSocketAdaptor.send(JSON.stringify(jsCmd));
  }

  function addFakeParticipant() {
    let suffix = "fake" + fakeParticipantCounter;
    let tempCount = fakeParticipantCounter + 1;
    setFakeParticipantCounter(tempCount);

    let allParticipantsTemp = allParticipants;
    let broadcastObject = { name: "name_" + suffix,
      streamId: "streamId_" + suffix,
      metaData: JSON.stringify({isCameraOn: false}),
      isFake: true
    };
    allParticipantsTemp["streamId_" + suffix] = broadcastObject;
    setAllParticipants(allParticipantsTemp);

    if(Object.keys(allParticipantsTemp).length <= globals.maxVideoTrackCount) {
      let newVideoTrack = {
        id: "id_" + suffix,
        videoLabel: "label_" + suffix,
        track: null,
        isCameraOn: false,
        streamId: "streamId_" + suffix,
        name: "name_" + suffix,
      };
      let temp = participants;
      temp.push(newVideoTrack);
      setParticipants(temp);
    }

    console.log("fake participant added");
    setParticipantUpdated(!participantUpdated);
  }

  function removeFakeParticipant() {
    let tempCount = fakeParticipantCounter - 1;
    let suffix = "fake" + tempCount;
    setFakeParticipantCounter(tempCount);

    let temp = participants.filter(el => el.streamId !== "streamId_" + suffix)
    setParticipants(temp);

    let allParticipantsTemp = allParticipants;
    delete allParticipantsTemp["streamId_" + suffix];
    setAllParticipants(allParticipantsTemp);

    console.log("fake participant removed");
    setParticipantUpdated(!participantUpdated);
  }

  function handleMainTrackBroadcastObject(broadcastObject) {
    let participantIds = broadcastObject.subTrackStreamIds;

    let tempParticipants = participants;
    //find and remove not available tracks
    const temp = allParticipants;
    let currentTracks = Object.keys(temp);
    currentTracks.forEach(trackId => {
      if (!allParticipants[trackId].isFake && !participantIds.includes(trackId)) {
        console.log("stream removed:" + trackId);

        //check if pinned participant left the room. If this is the case, set pinnedVideoId to undefined
        let pinnedParticipant = participants.find(e => e.id === pinnedVideoId);
        if((pinnedVideoId !== undefined && pinnedParticipant === undefined)  //because participantVideo may be remeoved
            || pinnedParticipant?.streamId === trackId) {
          setPinnedVideoId(undefined);
        }

        participants.forEach((p, index) => {
          if (p.streamId === trackId) {
            tempParticipants.splice(index, 1);
          }
        });

        delete temp[trackId];
      }
    });
    setParticipants(tempParticipants);
    setAllParticipants(temp);
    setParticipantUpdated(!participantUpdated);

    //request broadcast object for new tracks
    participantIds.forEach(pid => {
      //if (allParticipants[pid] === undefined) {
        webRTCAdaptor.getBroadcastObject(pid);
      //}
    });

    // We need to wait 5 seconds to make sure that data channel connection is established and websocket connection is ready.
    // Otherwise, our websocket connection will be closed.
    /*
    if (!isListener) {
      setTimeout(() => {
        webRTCAdaptor?.updateVideoTrackAssignments(publishStreamId, 0, 20);
      }, 5000);
    }
    */
  }

  function handleSubtrackBroadcastObject(broadcastObject) {
    if (broadcastObject.metaData !== undefined && broadcastObject.metaData !== null) {
      let userStatusMetadata = JSON.parse(broadcastObject.metaData);

      if (userStatusMetadata.isScreenShared) {
        // if the participant was already pin someone than we should not update it
        if (!screenSharedVideoId) {
          setScreenSharedVideoId(broadcastObject.streamId);
          let videoLab = participants.find((p) => p.streamId === broadcastObject.streamId)
            ?.videoLabel
            ? participants.find((p) => p.streamId === broadcastObject.streamId).videoLabel
            : "";
          // Removing auto pin
          //pinVideo(broadcastObject.streamId, videoLab);
        }
      }
    }

    let allParticipantsTemp = allParticipants;
    allParticipantsTemp[broadcastObject.streamId] = broadcastObject; //TODO: optimize
    setAllParticipants(allParticipantsTemp);
    setParticipantUpdated(!participantUpdated);
  }

  useEffect(() => {
    async function createWebRTCAdaptor() {
      //here we check if audio or video device available and wait result
      //according to the result we modify mediaConstraints
      await checkDevices();
      if (recreateAdaptor && webRTCAdaptor == null) {
        setWebRTCAdaptor(new WebRTCAdaptor({
          websocket_url: websocketURL,
          mediaConstraints: (playOnly) ? {video: false, audio: false} : mediaConstraints,
          playOnly: playOnly,
          debug: true,
          callback: infoCallback,
          callbackError: errorCallback
        }))

        setRecreateAdaptor(false);
      }
    }
    createWebRTCAdaptor();
  }, [recreateAdaptor]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (webRTCAdaptor) {
    webRTCAdaptor.callback = infoCallback;
    webRTCAdaptor.callbackError = errorCallback;
    webRTCAdaptor.localStream = localVideo;
  }

  function infoCallback(info, obj) {
    if (info === "initialized") {
      enableDisableMCU(mcuEnabled);
      setInitialized(true);
    } else if (info === "broadcastObject") {
      if (obj.broadcast === undefined) { return; }

      let broadcastObject = JSON.parse(obj.broadcast);

      if (obj.streamId === roomName) { //maintrack object
        handleMainTrackBroadcastObject(broadcastObject);
      } else { //subtrack object
        handleSubtrackBroadcastObject(broadcastObject);
      }

      console.log(obj.broadcast);
    } else if (info === "newStreamAvailable") {
      handlePlayVideo(obj);
    } else if (info === "publish_started") {
      setIsPublished(true);
      console.log("**** publish started:" + reconnecting);
      if (reconnecting) {
        console.log("publishReconnected");
        publishReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
      webRTCAdaptor.play(roomName, playToken, roomName, null, subscriberId, subscriberCode);
      if (isAdmin == "true") {
        createListenerRoomIfNotExists();
      }
      console.log("publish started");
      //stream is being published
      webRTCAdaptor.enableStats(publishStreamId);
    } else if (info === "publish_finished") {
      //stream is being finished
      setIsPublished(false);
    }
    else if (info === "session_restored") {
      console.log("**** session_restored:" + reconnecting);
      if (reconnecting) {
        console.log("sessionRestored after reconnecting state");
        publishReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
    }
    else if (info === "play_started") {
      console.log("**** play started:" + reconnecting);
      setIsPlayStarted(true);

      roomName = obj.streamId;
      webRTCAdaptor.getBroadcastObject(roomName);

      if (reconnecting) {
        console.log("playReconnected");
        playReconnected = true;
        reconnecting = !(publishReconnected && playReconnected);
        return;
      }
    }
    else if (info === "play_finished") {
      console.log("**** play finished:" + reconnecting);
      setIsPlayStarted(false);
    }
    else if (info === "screen_share_stopped") {
      handleScreenshareNotFromPlatform();
    } else if (info === "screen_share_started") {
      screenShareOnNotification();
    } else if (info === "data_received") {
        try {
            let notificationEvent = JSON.parse(obj.data);
            if (notificationEvent != null && typeof notificationEvent == "object") {
                let eventStreamId = notificationEvent.streamId;
                let eventType = notificationEvent.eventType;
                if (eventType === "REQUEST_PUBLISH" && admin == "true") {
                    console.log("webrtc publish request is received from attendee with streamId: " + eventStreamId);
                    handleSendMessageAdmin("admin*listener_room*"+eventStreamId+"*GRANT_BECOME_PUBLISHER");
                } else if (eventType === "BROADCAST_ON" && !webRTCAdaptor.onlyDataChannel && eventStreamId === publishStreamId) {
                setIsBroadcasting(true);
                console.log("BROADCAST_ON");
              } else if (eventType === "BROADCAST_OFF" && !webRTCAdaptor.onlyDataChannel && eventStreamId === publishStreamId) {
                setIsBroadcasting(false);
                console.log("BROADCAST_OFF");
              }
            }
        } catch (e) {}
      try {
        handleNotificationEvent(obj);
      } catch (e) { }
    } else if (info === "available_devices") {
      setDevices(obj);
      checkAndUpdateVideoAudioSources();

    } else if (info === "updated_stats") {
      let rtt = ((parseFloat(obj.videoRoundTripTime) + parseFloat(obj.audioRoundTripTime)) / 2).toPrecision(3);
      let jitter = ((parseFloat(obj.videoJitter) + parseInt(obj.audioJitter)) / 2).toPrecision(3);
      let outgoingBitrate = parseInt(obj.currentOutgoingBitrate);

      let packageLost = parseInt(obj.videoPacketsLost) + parseInt(obj.audioPacketsLost);
      let packageSent = parseInt(obj.totalVideoPacketsSent) + parseInt(obj.totalAudioPacketsSent);
      let packageLostPercentage = 0;
      if (packageLost > 0) {
        packageLostPercentage = ((packageLost / parseInt(packageSent)) * 100).toPrecision(3);
      }

      if (rtt >= 150 || packageLostPercentage >= 2.5 || jitter >= 80 || ((outgoingBitrate / 100) * 80) >= obj.availableOutgoingBitrate) {
        console.warn("rtt:" + rtt + " packageLostPercentage:" + packageLostPercentage + " jitter:" + jitter + " Available Bandwidth kbps :", obj.availableOutgoingBitrate, "Outgoing Bandwidth kbps:", outgoingBitrate);
        displayPoorNetworkConnectionWarning();
      }

    } else if (info === "debugInfo") {
      handleDebugInfo(obj.debugInfo);
    } else if (info === "ice_connection_state_changed") {
      console.log("iceConnectionState Changed: ", JSON.stringify(obj))
      var iceState = obj.state;
      if (iceState === "failed" || iceState === "disconnected" || iceState === "closed") {

        setTimeout(() => {
          if (webRTCAdaptor.iceConnectionState(publishStreamId) !== "checking" &&
            webRTCAdaptor.iceConnectionState(publishStreamId) !== "connected" &&
            webRTCAdaptor.iceConnectionState(publishStreamId) !== "completed") {
            reconnectionInProgress();
          }
        }, 5000);

      }
    } else if (info === "pong") {
      // This is a workaround for the video track assignment list issue. We should remove this workaround when the issue is fixed on the server side.
      // When the publisher or play only user joins the room, we send the video track assignment list from the server
      // to the client via data channel. But sometimes, the client does not receive the video track assignment list.
      // This is happening because of the data channel connection is not established yet.
      // When we receive pong message, we check if the video track assignment list came at least once.
      // If it is not received, we send a request to get the video track assignment list.
      // We use pong message because it is sent periodically.
      // Mustafa B
      if (Object.keys(allParticipants).length !== 0 && videoTrackAssignmentListReceived === false) {
        // If allParticipants is not empty but video track assignment is not received,
        // we send a request to get the video track assignment list.
        getVideoTrackAssignments(roomName);
        console.log("getVideoTrackAssignments is called manually!");
      }
    }
  }

  function errorCallback(error, message) {
    //some of the possible errors, NotFoundError, SecurityError,PermissionDeniedError
    var errorMessage = JSON.stringify(error);
    if (typeof message != "undefined") {
      errorMessage = message;
    }
    if (error.indexOf("no_active_streams_in_room") !== -1) {
      errorMessage = "No active stream in the room.";
    }
    errorMessage = JSON.stringify(error);
    if (error.indexOf("NotFoundError") !== -1) {
      errorMessage =
        "Camera or Mic are not found or not allowed in your device.";
      alert(errorMessage);
    } else if (
      error.indexOf("NotReadableError") !== -1 ||
      error.indexOf("TrackStartError") !== -1
    ) {
      errorMessage =
        "Camera or Mic is being used by some other process that does not not allow these devices to be read.";
      displayWarning(errorMessage);

    } else if (
      error.indexOf("OverconstrainedError") !== -1 ||
      error.indexOf("ConstraintNotSatisfiedError") !== -1
    ) {
      errorMessage =
        "There is no device found that fits your video and audio constraints. You may change video and audio constraints.";
      alert(errorMessage);
    } else if (
      error.indexOf("NotAllowedError") !== -1 ||
      error.indexOf("PermissionDeniedError") !== -1
    ) {
      errorMessage = "You are not allowed to access camera and mic.";
      if (isScreenShared) {
        handleScreenshareNotFromPlatform();
      }
    } else if (error.indexOf("TypeError") !== -1) {
      errorMessage = "Video/Audio is required.";
      displayWarning(errorMessage);
      webRTCAdaptor.mediaManager.getDevices();
    } else if (error.indexOf("UnsecureContext") !== -1) {
      errorMessage =
        "Fatal Error: Browser cannot access camera and mic because of unsecure context. Please install SSL and access via https";
    } else if (error.indexOf("WebSocketNotSupported") !== -1) {
      errorMessage = "Fatal Error: WebSocket not supported in this browser";
    } else if (error.indexOf("no_stream_exist") !== -1) {
      //TODO: removeRemoteVideo(error.streamId);
    } else if (error.indexOf("data_channel_error") !== -1) {
      errorMessage = "There was a error during data channel communication";
    } else if (error.indexOf("ScreenSharePermissionDenied") !== -1) {
      errorMessage = "You are not allowed to access screen share";
      handleScreenshareNotFromPlatform();
    } else if (error.indexOf("WebSocketNotConnected") !== -1) {
      errorMessage = "WebSocket Connection is disconnected.";
    }
    else if (error.indexOf("already_publishing") !== -1) {
      console.log("**** already publishing:" + reconnecting);
      if (reconnecting) {
        webRTCAdaptor.stop(publishStreamId);

        setTimeout(() => {
          handlePublish(
            publishStreamId,
            publishToken,
            subscriberId,
            subscriberCode
          );
        }, 2000);
      }
    }


    console.log("***** " + error)

  };

  function createListenerRoomIfNotExists() {
    const baseUrl = restBaseUrl;
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ streamId: roomName + "listener", status: "broadcasting" })
    };
    fetch(baseUrl + "/rest/v2/broadcasts/create", requestOptions)
      .then((response) => { return response.json(); })
      .then((data) => {
        if (data.success) {
          console.log("listener room created.");
        } else {
          console.log("listener room is already exist.");
        }
      });
  }

  function deleteListenerRoom() {
    const baseUrl = restBaseUrl;
    const requestOptions = {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    };
    fetch(baseUrl + "/rest/v2/broadcasts/" + roomName + "listener", requestOptions)
      .then((response) => { return response.json(); })
      .then((data) => {
        if (data.success) {
          console.log("listener room is deleted.");
        } else {
          console.log("listener room is not deleted.");
        }
      });
  }

  window.makeFullScreen = makeFullScreen;

    function getMediaConstraints(videoSendResolution, frameRate) {
        let constraint = null;

        switch (videoSendResolution) {
            case "qvgaConstraints":
                constraint = {
                    video: {
                        width: {ideal: 320}, height: {ideal: 180},
                        advanced: [
                            {frameRate: {min: frameRate}}, {height: {min: 180}}, {width: {min: 320}}, {frameRate: {max: frameRate}}, {width: {max: 320}}, {height: {max: 180}}, {aspectRatio: {exact: 1.77778}}
                        ]
                    }
                };
                break;
            case "vgaConstraints":
                constraint = {
                    video: {
                        width: {ideal: 640}, height: {ideal: 360},
                        advanced: [
                            {frameRate: {min: frameRate}}, {height: {min: 360}}, {width: {min: 640}}, {frameRate: {max: frameRate}}, {width: {max: 640}}, {height: {max: 360}}, {aspectRatio: {exact: 1.77778}}
                        ]
                    }
                };
                break;
            case "hdConstraints":
                constraint = {
                    video: {
                        width: {ideal: 1280}, height: {ideal: 720},
                        advanced: [
                            {frameRate: {min: frameRate}}, {height: {min: 720}}, {width: {min: 1280}}, {frameRate: {max: frameRate}}, {width: {max: 1280}}, {height: {max: 720}}, {aspectRatio: {exact: 1.77778}}
                        ]
                    }
                };
                break;
            case "fullHdConstraints":
                constraint = {
                    video: {
                        width: {ideal: 1920}, height: {ideal: 1080},
                        advanced: [
                            {frameRate: {min: frameRate}}, {height: {min: 1080}}, {width: {min: 1920}}, {frameRate: {max: frameRate}}, {width: {max: 1920}}, {height: {max: 1080}}, {aspectRatio: {exact: 1.77778}}
                        ]
                    }
                };
                break;
            default:
                break;
        }

        return constraint;
    }


  function setLocalVideo() {

    let tempLocalVideo = document.getElementById("localVideo");
    if (tempLocalVideo) {
      setLocalVideoLocal(tempLocalVideo);
      webRTCAdaptor.mediaManager.localVideo = tempLocalVideo;
      webRTCAdaptor.mediaManager.localVideo.srcObject = webRTCAdaptor.mediaManager.localStream;
    }
  }

  function assignVideoToStream(videoTrackId, streamId) {
    webRTCAdaptor.assignVideoTrack(videoTrackId, streamId, true);
  }

  function pinVideo(id, videoLabelProp = "") {
    if (id === "localVideo") {
      videoLabelProp = "localVideo";
    }

    // id is for pinning user.
    let videoLabel = videoLabelProp;
      if (videoLabel === undefined || videoLabel === "") {
          // if videoLabel is missing try to find it from participants.
          videoLabel = participants.find((p) => id === p.id)?.videoLabel;
      }
      if (videoLabel === undefined || videoLabel === "") {
          // if videoLabel is still missing get the firs one if it exist, this may happen when one join while someone is sharing screen
          videoLabel = participants[1]?.videoLabel;
      }

    var streamId = participants.find((p) => id === p.id)?.streamId;
    // if we already pin the targeted user then we are going to remove it from pinned video.
    if (pinnedVideoId === id) {
      setPinnedVideoId(undefined);
      handleNotifyUnpinUser(id);
      //webRTCAdaptor.assignVideoTrack(videoLabel, streamId, false);
    }
    // if there is no pinned video we are gonna pin the targeted user.
    // and we need to inform pinned user.
    else {
      setPinnedVideoId(videoLabel);
      handleNotifyPinUser(id);
      webRTCAdaptor.assignVideoTrack(videoLabel, streamId, true);
    }
  }

  function handleNotifyPinUser(id) {
    if (id === "localVideo") {
      // if we pin local video then we are not going to inform anyone.
      return;
    }
    // If I PIN USER then i am going to inform pinned user.
    // Why? Because if i pin someone, pinned user's resolution has to change for better visibility.
    handleSendNotificationEvent("PIN_USER", publishStreamId, {
      streamId: id,
    });
  }

  function handleNotifyUnpinUser(id) {
    // If I UNPIN USER then i am going to inform pinned user.
    // Why? We need to decrease resolution for pinned user's internet usage.
    handleSendNotificationEvent("UNPIN_USER", publishStreamId, {
      streamId: id,
    });
  }

  function handleSetMaxVideoTrackCount(maxTrackCount) {
    if (publishStreamId) {
      webRTCAdaptor.setMaxVideoTrackCount(publishStreamId, maxTrackCount);
      globals.maxVideoTrackCount = maxTrackCount;
    }
  }

  function enableDisableMCU(isMCUEnabled) {
    if (isMCUEnabled) {
      setRoomJoinMode(JoinModes.MCU);
    } else {
      setRoomJoinMode(JoinModes.MULTITRACK);
    }
  }
  function handleStartScreenShare() {
    webRTCAdaptor.switchDesktopCapture(publishStreamId)
      .then(() => {
        screenShareOnNotification();
      });
  }

  function screenShareOffNotification() {
    handleSendNotificationEvent(
      "SCREEN_SHARED_OFF",
      publishStreamId
    );
    //if I stop my screen share and if i have pin someone different from myself it just should not effect my pinned video.
    if (pinnedVideoId === "localVideo") {
      setPinnedVideoId(undefined);
    }

    let userStatusMetadata = getUserStatusMetadata(isMyMicMuted, !isMyCamTurnedOff, false);
    webRTCAdaptor.updateStreamMetaData(publishStreamId, JSON.stringify(userStatusMetadata));
  }
  function screenShareOnNotification() {
    setIsScreenShared(true);
    handleSendNotificationEvent(
      "SCREEN_SHARED_ON",
      publishStreamId
    );

    let userStatusMetadata = getUserStatusMetadata(isMyMicMuted, !isMyCamTurnedOff, true);
    webRTCAdaptor.updateStreamMetaData(publishStreamId, JSON.stringify(userStatusMetadata));
  }

  function turnOffYourMicNotification(participantId) {
    handleSendNotificationEvent(
      "TURN_YOUR_MIC_OFF",
      publishStreamId,
      {
        streamId: participantId,
        senderStreamId: publishStreamId
      }
    );
  }

  function turnOnYourMicNotification(participantId) {
    handleSendNotificationEvent(
      "TURN_YOUR_MIC_ON",
      publishStreamId,
      {
        streamId: participantId,
        senderStreamId: publishStreamId
      }
    );
  }

  function turnOffYourCamNotification(participantId) {
    handleSendNotificationEvent(
      "TURN_YOUR_CAM_OFF",
      publishStreamId,
      {
        streamId: participantId,
        senderStreamId: publishStreamId
      }
    );
  }

  function sendReactions(reaction) {
    handleSendNotificationEvent(
        "REACTIONS",
        publishStreamId,
        {
          reaction: reaction,
          senderStreamId: publishStreamId,
        }
    );
    showReactions(publishStreamId, reaction);
  }

  function displayPoorNetworkConnectionWarning() {
    if (last_warning_time == null || Date.now() - last_warning_time > 1000 * 30) {
      last_warning_time = Date.now();
      displayWarning("Your connection is not stable. Please check your internet connection!");
    }
  }

  function displayWarning(message) {
    enqueueSnackbar(
      {
        message: message,
        variant: "info",
        icon: <SvgIcon size={24} name={'report'} color="red" />
      },
      {
        autoHideDuration: 5000,
        anchorOrigin: {
          vertical: "top",
          horizontal: "right",
        },
      }
    );
  }

  function handleScreenshareNotFromPlatform() {
    if (typeof webRTCAdaptor !== "undefined") {
      setIsScreenShared(false);
      if (isMyCamTurnedOff) {
        webRTCAdaptor.turnOffLocalCamera(publishStreamId);
      } else {
        webRTCAdaptor.switchVideoCameraCapture(publishStreamId);
      }
      screenShareOffNotification();
      updateVideoSendResolution(false);
      setCloseScreenShare(false);
    } else {
      setCloseScreenShare(true);
    }
  }
  function handleStopScreenShare() {
    setIsScreenShared(false);
    if (isMyCamTurnedOff) {
      webRTCAdaptor.turnOffLocalCamera(publishStreamId);
    } else {
      webRTCAdaptor.switchVideoCameraCapture(publishStreamId);

      // isCameraOff = true;
    }
    screenShareOffNotification();
  }
  function handleSetMessages(newMessage) {
    setMessages((oldMessages) => {
      let lastMessage = oldMessages[oldMessages.length - 1]; //this must remain mutable
      const isSameUser = lastMessage?.name === newMessage?.name;
      const sentInSameTime = lastMessage?.date === newMessage?.date;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      newMessage.date = new Date(newMessage?.date).toLocaleString(getLang(), { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
      calculate_scroll_height();
      if (isSameUser && sentInSameTime) {
        //group the messages *sent back to back in the same timeframe by the same user* by joinig the new message text with new line
        lastMessage.message = lastMessage.message + "\n" + newMessage.message;
        return [...oldMessages]; // don't make this "return oldMessages;" this is to trigger the useEffect for scroll bottom and get over showing the last prev state do
      } else {
        return [...oldMessages, newMessage];
      }
    });
  }

  function getLang() {
    if (navigator.languages !== undefined)
      return navigator.languages[0];
    return navigator.language;
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (closeScreenShare) {
      handleScreenshareNotFromPlatform();
    }
  }, [closeScreenShare]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isPublished || isPlayStarted || webRTCAdaptor == null) {
      return;
    }
    if (makeOnlyDataChannelPublisher)
    {
      makeOnlyDataChannelPublisher = false;
      playOnly = false;
      setIsListener(false);
      removeAllRemoteParticipants();
      webRTCAdaptor.onlyDataChannel = false;
      roomName = roomName.replace("listener", "");
      //webRTCAdaptor.changeRoomName(newRoom);
      joinRoom(roomName, publishStreamId, "legacy");
    } else if (makePublisherOnlyDataChannel) {
      makePublisherOnlyDataChannel = false;
      playOnly = true;
      setIsListener(true);
      webRTCAdaptor.onlyDataChannel = true;
      removeAllRemoteParticipants();
      roomName = roomName + "listener";
      //webRTCAdaptor.changeRoomName(newRoom);
      joinRoom(roomName, publishStreamId, "legacy");
    }
  }, [isPublished, isPlayStarted]);  // eslint-disable-line react-hooks/exhaustive-deps

  function scrollToBottom() {
    let objDiv = document.getElementById("paper-props");
    if (objDiv && scroll_down && objDiv.scrollHeight > objDiv.clientHeight) {
      objDiv.scrollTo(0, objDiv.scrollHeight);
      scrollThreshold = 0.95;
      scroll_down = false;
    }

  }
  function handleMessageDrawerOpen(open) {
    closeSnackbar();
    setMessageDrawerOpen(open);
    if (open) {
      setParticipantListDrawerOpen(false);
      setPublisherRequestListDrawerOpen(false);
    }
  }

  function handleParticipantListOpen(open) {
    setParticipantListDrawerOpen(open);
    if (open) {
      setMessageDrawerOpen(false);
      setPublisherRequestListDrawerOpen(false);
    }
  }

  function handlePublisherRequestListOpen(open) {
    setPublisherRequestListDrawerOpen(open);
    if (open) {
      setMessageDrawerOpen(false);
      setParticipantListDrawerOpen(false);
    }
  }

    function handleSendMessage(message) {
        if (isListener && message === "debugme") {
          webRTCAdaptor.getDebugInfo(roomName);
          return;
        } else if (message === "clearme") {
          setMessages([]);
          return;
        } else if (message === "refreshme") {
          refreshRoom();
          return;
        }

        if (publishStreamId) {
            let iceState = webRTCAdaptor.iceConnectionState(publishStreamId);
            if (
                iceState !== null &&
                iceState !== "failed" &&
                iceState !== "disconnected"
            ) {
                if (message === "debugme") {
                    webRTCAdaptor.getDebugInfo(publishStreamId);
                    return;
                } else if (message === "refreshme") {
                  refreshRoom();
                  return;
                }

                webRTCAdaptor.sendData(
                    publishStreamId,
                    JSON.stringify({
                        eventType: "MESSAGE_RECEIVED",
                        message: message,
                        name: streamName,
                        senderId: publishStreamId,
                        date: new Date().toString()
                    })
                );
            }
        }
    }

  function handleDebugInfo(debugInfo) {
    var infoText = "Client Debug Info\n";
    infoText += "Events:\n";
    infoText += JSON.stringify(globals.trackEvents) + "\n";
    infoText += "Participants (" + participants.length + "):\n\n";
    infoText += JSON.stringify(participants) + "\n\n";
    infoText += "All Participants (" + Object.keys(allParticipants).length + "):\n";
    Object.entries(allParticipants).forEach(([key, value]) => {
      infoText += "- " + key + "\n";
    });
    infoText += "----------------------\n";
    infoText += debugInfo;

    //fake message to add chat
    var obj = {
      streamId: publishStreamId,
      data: JSON.stringify({
        eventType: "MESSAGE_RECEIVED",
        name: "Debugger",
        date: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        message: infoText,
      }),
    };

    handleNotificationEvent(obj);
  }

  function toggleSetNumberOfUnreadMessages(numb) {
    setNumberOfUnReadMessages(numb);
  }
  function calculate_scroll_height() {
    let objDiv = document.getElementById("paper-props");
    if (objDiv) {
      let scrollPosition = objDiv.scrollTop / (objDiv.scrollHeight - objDiv.clientHeight);
      if (scrollPosition > scrollThreshold) {
        scroll_down = true;
      }
    }
  }
  function handleNotificationEvent(obj) {
    var notificationEvent = JSON.parse(obj.data);
    if (notificationEvent != null && typeof notificationEvent == "object") {
      var eventStreamId = notificationEvent.streamId;
      var eventType = notificationEvent.eventType;

      if (eventType === "CAM_TURNED_OFF" ||
        eventType === "CAM_TURNED_ON" ||
        eventType === "MIC_MUTED" ||
        eventType === "MIC_UNMUTED") {
        webRTCAdaptor.getBroadcastObject(eventStreamId);
      }
      else if (eventType === "MESSAGE_RECEIVED") {
        if(notificationEvent.senderId === publishStreamId || isFakeeh === true) {
          return;
        }
        calculate_scroll_height();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        notificationEvent.date = new Date(notificationEvent?.date).toLocaleString(getLang(), { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
        // if message arrives.
        // if there is an new message and user has not opened message component then we are going to increase number of unread messages by one.
        // we are gonna also send snackbar.
        if (!messageDrawerOpen) {
          enqueueSnackbar(
            {
              sender: notificationEvent.name,
              message: notificationEvent.message,
              variant: "message",
              onClick: () => {
                handleMessageDrawerOpen(true);
                setNumberOfUnReadMessages(0);
              },
            },
            {
              autoHideDuration: 5000,
              anchorOrigin: {
                vertical: "top",
                horizontal: "right",
              },
            }
          );
          setNumberOfUnReadMessages((numb) => numb + 1);
        }
        setMessages((oldMessages) => {
          let lastMessage = oldMessages[oldMessages.length - 1]; //this must remain mutable
          const isSameUser = lastMessage?.name === notificationEvent?.name;
          const sentInSameTime = lastMessage?.date === notificationEvent?.date;

          if (isSameUser && sentInSameTime) {
            //group the messages *sent back to back in the same timeframe by the same user* by joinig the new message text with new line
            lastMessage.message =
              lastMessage.message + "\n" + notificationEvent.message;
            return [...oldMessages]; // dont make this "return oldMessages;" this is to trigger the useEffect for scroll bottom and get over showing the last prev state do
          } else {
            return [...oldMessages, notificationEvent];
          }
        });
      }
      else if (eventType === "GRANT_BECOME_PUBLISHER"/* && webRTCAdaptor.*/ && eventStreamId === publishStreamId)
      {
          navigator.mediaDevices
              .enumerateDevices()
              .then((devices) => {
                  let audioInputDevices = [];
                  let videoInputDevices = [];
                  devices.forEach((device) => {
                      if (device.kind === "audioinput") {
                          audioInputDevices.push(device);
                      } else if (device.kind === "videoinput") {
                          videoInputDevices.push(device);
                      }
                      console.log(`${device.kind}: ${device.label} id = ${device.deviceId}`);
                  });
                  if (audioInputDevices.length > 0 && videoInputDevices.length > 0)
                  {
                      makeOnlyDataChannelPublisher = true;
                      makePublisherOnlyDataChannel = false;
                      let tempPublishStreamId = publishStreamId + "tempPublisher";
                      setPublishStreamId(tempPublishStreamId);
                      webRTCAdaptor.leaveFromRoom(roomName);
                  } else {
                      webRTCAdaptor.displayNoVideoAudioDeviceFoundWarning();
                  }
              })
              .catch((err) => {
                  console.error(`${err.name}: ${err.message}`);
              });
      }
      else if (eventType == "REJECT_SPEAKER_REQUEST" && webRTCAdaptor.onlyDataChannel && eventStreamId === publishStreamId)
      {
          window.showNotification(
              'Your request to join the room is rejected by the host'
          );
      }
      else if (eventType === "MAKE_LISTENER_AGAIN" && !webRTCAdaptor.onlyDataChannel && eventStreamId === publishStreamId) {
          makePublisherOnlyDataChannel = true;
          makeOnlyDataChannelPublisher = false;
          setIsBroadcasting(false);
          let tempPublishStreamId = publishStreamId.replace('tempPublisher', '');
          setPublishStreamId(tempPublishStreamId);
          handleLeaveFromRoom();
      }
      /* else if (eventType === "STOP_PLAYING" && webRTCAdaptor.onlyDataChannel) {
        webRTCAdaptor.stop(eventStreamId);
        let tempAllParticipants = allParticipants;

        delete tempAllParticipants[eventStreamId];

        setAllParticipants(tempAllParticipants);

        let tempParticipants = participants;

        let participantIdCounter = 0;
        let participantId = null;
        tempParticipants.forEach((p) => {
          if (p.streamId === eventStreamId) {
            participantId = participantIdCounter;
            return;
          }
          participantIdCounter = participantIdCounter + 1;
        });
        if (participantId != null) {
          tempParticipants.splice(participantId, 1);
          setParticipants(tempParticipants);
        }
      }*/
      else if (eventType === "SCREEN_SHARED_ON") {
        let videoLab = participants.find((p) => p.streamId === eventStreamId)?.videoLabel;

        if(videoLab === undefined) {
          //no video player assigned to that participant, assign first player to screen sharer
          videoLab = participants[1].id;
          assignVideoToStream(videoLab, eventStreamId);
        }

        // Removing auto pin
        //pinVideo(videoLab, videoLab);
        setScreenSharedVideoId(eventStreamId);
        webRTCAdaptor.getBroadcastObject(eventStreamId);
      }
      else if (eventType === "SCREEN_SHARED_OFF") {
        setScreenSharedVideoId(null);
        setPinnedVideoId(undefined);
        webRTCAdaptor.getBroadcastObject(eventStreamId);
      }
      else if (eventType === "REACTIONS" && notificationEvent.senderStreamId !== publishStreamId) {
        showReactions(notificationEvent.senderStreamId, notificationEvent.reaction);
      }
      else if (eventType === "TURN_YOUR_MIC_OFF") {
        if (publishStreamId === notificationEvent.streamId) {
          console.warn(notificationEvent.senderStreamId, "muted you");
          muteLocalMic();
        }
      }
      else if (eventType === "TURN_YOUR_MIC_ON") {
        if (publishStreamId === notificationEvent.streamId) {
          console.warn(notificationEvent.senderStreamId, "turns your mic on");
          unmuteLocalMic();
        }
      }
      else if (eventType === "TURN_YOUR_CAM_OFF") {
        if (publishStreamId === notificationEvent.streamId) {
          console.warn(notificationEvent.senderStreamId, "closed your cam");
          checkAndTurnOffLocalCamera(publishStreamId);
        }
      }
      else if (eventType === "PIN_USER") {
        if (
          notificationEvent.streamId === publishStreamId &&
          !isScreenShared
        ) {
            updateVideoSendResolution(true);
        }
      }
      else if (eventType === "UNPIN_USER") {
        if (
          notificationEvent.streamId === publishStreamId &&
          !isScreenShared
        ) {
            updateVideoSendResolution(false);
        }
      }
      else if (eventType === "VIDEO_TRACK_ASSIGNMENT_LIST") {
        console.debug("VIDEO_TRACK_ASSIGNMENT_LIST -> ", obj);

        setVideoTrackAssignmentListReceived(true);

        let videoTrackAssignments = notificationEvent.payload;

        let temp = participants;

        //remove not available videotracks if exist
        temp.forEach((p) => {
          let assignment = videoTrackAssignments.find((vta) => p.videoLabel === vta.videoLabel);
          if (!p.isMine && assignment === undefined) {
            temp.splice(temp.findIndex(p), 1);
          }
        });

        //add and/or update participants according to current assignments
        videoTrackAssignments.forEach((vta) => {
          temp.forEach((p) => {
            if (p.videoLabel === vta.videoLabel) {
              p.streamId = vta.trackId;
              let broadcastObject = allParticipants[p.streamId];
              if (broadcastObject) {
                p.name = broadcastObject.name;
              }
            }
          });
        });

        let hostParticipantId = null;
        let participantId = 0;

        temp.forEach((p) => {
          if (p.name === "Host") {
            hostParticipantId = participantId;
          }

          participantId = participantId + 1;
        });

        if (hostParticipantId != null) {
          temp.splice(hostParticipantId, 1);
        }

        setParticipants(temp);
        setParticipantUpdated(!participantUpdated);
      }
      else if (eventType === "AUDIO_TRACK_ASSIGNMENT") {
        clearInterval(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setTalkers([]);
        }, 1000);
        //console.log(JSON.stringify(notificationEvent.payload));
        setTalkers((oldTalkers) => {
          const newTalkers = notificationEvent.payload
            .filter(
              (p) =>
                p.trackId !== "" &&
                screenSharedVideoId !== p.trackId &&
                p.audioLevel < 60
            )
            .map((p) => p.trackId);
          return _.isEqual(oldTalkers, newTalkers) ? oldTalkers : newTalkers;
        });
      }
      else if (eventType === "TRACK_LIST_UPDATED") {
        console.debug("TRACK_LIST_UPDATED -> ", obj);

        webRTCAdaptor.getBroadcastObject(roomName);
      }
    }
  }

  function getUserStatusMetadata(isMicMuted, isCameraOn, isScreenShareActive) {
    let metadata = {
      isMicMuted: isMicMuted === null ? null : isMicMuted,
      isCameraOn: isCameraOn,
      isScreenShared: isScreenShareActive,
      isPlayOnly: playOnly
    }

    return metadata;
  }

  function updateUserStatusMetadata(micMuted, cameraOn) {
    let metadata = getUserStatusMetadata(micMuted, cameraOn, isScreenShared);
    webRTCAdaptor.updateStreamMetaData(publishStreamId, JSON.stringify(metadata));
  }

  async function handleLeaveFromRoom() {
    /*
     Problem 4: If participant is published into the listener room and leaves the publisher room, publisher's sub-track isn't removed from the publisher room's broadcast object.
     Solution: Publisher removes itself from both of the rooms sub-tracks before leave.
     */
    if (isBroadcasting) {
      var requestOption0 = {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      };
      var requestOption1 = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      };
      var requestOption2 = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mainTrackStreamId: roomName
        })
      };

      // If we are broadcasting, we need to leave from the both of the room and then, stop the broadcast
      await fetch(restBaseUrl + "/rest/v2/broadcasts/" + roomName + "listener/subtrack?id=" + publishStreamId, requestOption0);
      await fetch(restBaseUrl + "/rest/v2/broadcasts/" + publishStreamId, requestOption2)
      await fetch( restBaseUrl+ "/rest/v2/broadcasts/conference-rooms/" + roomName + "listener/delete?streamId=" + publishStreamId, requestOption1);
    }

    leaveFromRoomAndCleanParticipants();

    setWaitingOrMeetingRoom("waiting");
  }

  function leaveFromRoomAndCleanParticipants() {
    // we need to empty participant array. if we are going to leave it in the first place.
    setParticipants([]);
    setAllParticipants({});

    clearInterval(audioListenerIntervalJob);
    audioListenerIntervalJob = null;

    webRTCAdaptor?.stop(publishStreamId);
    webRTCAdaptor?.stop(roomName);

    // add mechanism to listen play finished event publish finished event
    try {
      webRTCAdaptor?.turnOffLocalCamera(publishStreamId);
    } catch (e) {
      console.error("turnOffLocalCamera throws", e);
    }
  }

  // when user closes the tab or refreshes the page
  // we need to leave the room
  useBeforeUnload((ev) => {
    leaveFromRoomAndCleanParticipants();
  });

  function handleSendNotificationEvent(eventType, publishStreamId, info) {
    let notEvent = {
      streamId: publishStreamId,
      eventType: eventType,
      ...(info ? info : {}),
    };
    console.info("send notification event", notEvent);
    webRTCAdaptor.sendData(publishStreamId, JSON.stringify(notEvent));
  }

    function updateVideoSendResolution(isPinned) {
        let promise = null;
        let mediaConstraints = {video: true};

        if (isScreenShared) {
            mediaConstraints = getMediaConstraints("fullHdConstraints", 25);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else if (videoSendResolution === "auto" && !isPinned) {
            mediaConstraints = getMediaConstraints("qvgaConstraints", 15);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else if (videoSendResolution === "auto" && isPinned) {
            mediaConstraints = getMediaConstraints("qvgaConstraints", 25);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else if (videoSendResolution === "highDefinition") {
            mediaConstraints = getMediaConstraints("hdConstraints", 15);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else if (videoSendResolution === "standardDefinition") {
            mediaConstraints = getMediaConstraints("vgaConstraints", 15);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else if (videoSendResolution === "lowDefinition") {
            mediaConstraints = getMediaConstraints("qvgaConstraints", 15);
            promise = webRTCAdaptor?.applyConstraints(mediaConstraints);
        } else {
            console.error("Unknown camera resolution: " + videoSendResolution);
        }

        if (promise !== null) {
            promise?.then(() => {
                console.info("Camera resolution is updated to " + videoSendResolution + " mode");
                let videoTrackSettings = webRTCAdaptor?.mediaManager?.localStream?.getVideoTracks()[0]?.getSettings();
                console.info("Video track resolution: ", videoTrackSettings?.width, "x", videoTrackSettings?.height, " frame rate: ", videoTrackSettings?.frameRate);
            }).catch(err => {
                setVideoSendResolution("auto");
                console.error("Camera resolution is not updated to " + videoSendResolution + " mode. Error is " + err);
                console.info("Trying to update camera resolution to auto");
            });
        }
    }

  function refreshRoom() {
    webRTCAdaptor?.getBroadcastObject(roomName);
    getVideoTrackAssignments(roomName);
  }

  function removeAllRemoteParticipants() {
    console.log("entering removeAllRemoteParticipants");
    let newVideoTrack = {
      id: "localVideo",
      videoLabel: "localVideo",
      track: null,
      isCameraOn: false,
      streamId: publishStreamId,
      name: "You",
      isMine: true
    };

    let tempParticipants = [];
    if (!isListener) {
        tempParticipants.push(newVideoTrack);
    }
    setParticipants(tempParticipants);

    let allParticipantsTemp = {};
    if (playOnly  === "false" || playOnly === false) {
        allParticipantsTemp[publishStreamId] = {name: "You"};
    }
    setAllParticipants(allParticipantsTemp);
  }

  function addMeAsParticipant(publishStreamId) {
    let isParticipantExist = participants.find((p) => p.id === "localVideo");

    if(isParticipantExist || playOnly == "true" || playOnly === true) {
        return;
    }

    let newVideoTrack = {
      id: "localVideo",
      videoLabel: "localVideo",
      track: null,
      isCameraOn: false,
      streamId: publishStreamId,
      name: "You",
      isMine: true
    };
    let tempParticipants = participants;
    tempParticipants.push(newVideoTrack);
    setParticipants(tempParticipants);

    let allParticipantsTemp = allParticipants;
    allParticipantsTemp[publishStreamId] = {name:"You"};
    setAllParticipants(allParticipantsTemp);
  }


  function handlePublish(publishStreamId, token, subscriberId, subscriberCode) {
    let userStatusMetadata = getUserStatusMetadata(isMyMicMuted, !isMyCamTurnedOff, isScreenShared);

    addMeAsParticipant(publishStreamId);

    webRTCAdaptor.publish(
      publishStreamId,
      token,
      subscriberId,
      subscriberCode,
      streamName,
      roomName,
      JSON.stringify(userStatusMetadata)
    );
  }

  function handlePlayVideo(obj) {
    let index = obj?.trackId?.substring("ARDAMSx".length);
    globals.trackEvents.push({ track: obj.track.id, event: "added" });

    if (obj.track.kind === "audio") {
      var newAudioTrack = {
        id: index,
        track: obj.track,
        streamId: obj.streamId
      };

      //append new audio track, track id should be unique because of audio traack limitation
      let temp = audioTracks;
      temp.push(newAudioTrack);
      setAudioTracks(temp);
    }
    else if (obj.track.kind === "video") {
      let newVideoTrack = {
        id: index,
        videoLabel: index,
        track: obj.track,
        isCameraOn: true,
        streamId: obj.streamId,
        name: ""
      };
      //append new video track, track id should be unique because of video traack limitation
      let temp = participants;
      temp.push(newVideoTrack);
      setParticipants(temp);
    }
  }

  function setVirtualBackgroundImage(imageUrl) {
    let virtualBackgroundImage = document.createElement("img");
    virtualBackgroundImage.id = "virtualBackgroundImage";
    virtualBackgroundImage.style.visibility = "hidden";
    virtualBackgroundImage.alt = "virtual-background";

    if (imageUrl !== undefined && imageUrl !== null && imageUrl !== "") {
      virtualBackgroundImage.src = imageUrl;
    } else {
      virtualBackgroundImage.src = "virtual-background.png";
    }

    setVirtualBackground(virtualBackgroundImage);
    webRTCAdaptor.setBackgroundImage(virtualBackgroundImage);
  }

  function handleBackgroundReplacement(option) {
    let effectName;

    if (option === "none") {
      effectName = VideoEffect.NO_EFFECT;
      setIsVideoEffectRunning(false);
    }
    else if (option === "blur") {
      effectName = VideoEffect.BLUR_BACKGROUND;
      setIsVideoEffectRunning(true);
    }
    else if (option === "background") {
      if (virtualBackground === null) {
        setVirtualBackgroundImage(null);
      }
      effectName = VideoEffect.VIRTUAL_BACKGROUND
      setIsVideoEffectRunning(true);
    }
    webRTCAdaptor.enableEffect(effectName).then(() => {
      console.log("Effect: " + effectName + " is enabled");
    }).catch(err => {
      console.error("Effect: " + effectName + " is not enabled. Error is " + err);
      setIsVideoEffectRunning(false);
    });
  }
  function checkAndTurnOnLocalCamera(streamId) {
    if (isVideoEffectRunning) {
      webRTCAdaptor.mediaManager.localStream.getVideoTracks()[0].enabled = true;
    }
    else {
      webRTCAdaptor.turnOnLocalCamera(streamId);
    }

    updateUserStatusMetadata(isMyMicMuted, true);
    setIsMyCamTurnedOff(false);

    handleSendNotificationEvent(
      "CAM_TURNED_ON",
      publishStreamId
    );
  }

  function checkAndTurnOffLocalCamera(streamId) {
    if (isVideoEffectRunning) {
      webRTCAdaptor.mediaManager.localStream.getVideoTracks()[0].enabled = false;
    }
    else {
      webRTCAdaptor.turnOffLocalCamera(streamId);
    }

    updateUserStatusMetadata(isMyMicMuted, false);
      setIsMyCamTurnedOff(true);

    handleSendNotificationEvent(
      "CAM_TURNED_OFF",
      publishStreamId
    );
  }

  function getSelectedDevices() {
    let devices = {
      videoDeviceId: selectedCamera,
      audioDeviceId: selectedMicrophone
    }
    return devices;
  }

  function setSelectedDevices(devices) {
    if (devices.videoDeviceId !== null && devices.videoDeviceId !== undefined) {
      setSelectedCamera(devices.videoDeviceId);
      localStorage.setItem("selectedCamera", devices.videoDeviceId);
    }
    if (devices.audioDeviceId !== null && devices.audioDeviceId !== undefined) {
      setSelectedMicrophone(devices.audioDeviceId);
      localStorage.setItem("selectedMicrophone", devices.audioDeviceId);
    }
  }

  function cameraSelected(value) {
    if (selectedCamera !== value) {
      setSelectedDevices({ videoDeviceId: value });
      // When we first open home page, React will call this function and local stream is null at that time.
      // So, we need to catch the error.
      try {
        webRTCAdaptor.switchVideoCameraCapture(publishStreamId, value);
      } catch (e) {
        console.log("Local stream is not ready yet.");
      }
    }
  }

  function microphoneSelected(value) {
    setSelectedDevices({audioDeviceId: value});
    // When we first open home page, React will call this function and local stream is null at that time.
    // So, we need to catch the error.
    try {
      webRTCAdaptor.switchAudioInputSource(publishStreamId, value);
    } catch (e) {
      console.log("Local stream is not ready yet.");
    }
  }

  function showReactions(streamId, reactionRequest) {
    let reaction = '😀';
    let streamName = '';

    if (reactions[reactionRequest] !== undefined) {
      reaction = reactions[reactionRequest];
    }

    if (streamId === publishStreamId) {
        streamName = 'You';
    } else if (allParticipants[streamId]?.name !== undefined) {
        streamName = allParticipants[streamId].name;
    }

    floating({
      content: '<div>' + reaction + '<br><span style="background-color: #00564F;color: white;padding: 1px 2px;text-align: center;border-radius: 5px;font-size: 0.675em;">' + streamName + '</span></div>',
      number: 1,
      duration: 5,
      repeat: 1,
      direction: 'normal',
      size: 2
    });
  }

  function muteLocalMic() {
    webRTCAdaptor.muteLocalMic();
    updateUserStatusMetadata(true, !isMyCamTurnedOff);
    setIsMyMicMuted(true);

    handleSendNotificationEvent(
      "MIC_MUTED",
      publishStreamId
    );
  }

  function unmuteLocalMic() {
    webRTCAdaptor.unmuteLocalMic();
    updateUserStatusMetadata(false, !isMyCamTurnedOff);
    setIsMyMicMuted(false);

    handleSendNotificationEvent(
      "MIC_UNMUTED",
      publishStreamId
    );
  }

  function setAudioLevelListener(listener, period) {
    if (audioListenerIntervalJob == null) {
      audioListenerIntervalJob = setInterval(() => {
        if (webRTCAdaptor?.remotePeerConnection[publishStreamId] !== undefined && webRTCAdaptor?.remotePeerConnection[publishStreamId] !== null) {
          webRTCAdaptor?.remotePeerConnection[publishStreamId].getStats(null).then(stats => {
            for (const stat of stats.values()) {
              if (stat.type === 'media-source' && stat.kind === 'audio') {
                listener(stat?.audioLevel?.toFixed(2));
              }
            }
          });
        }
      }, period);
    }
  }

  return (!initialized ? <>
    <Grid
      container
      spacing={0}
      direction="column"
      alignItems="center"
      justifyContent="center"
      style={{ minHeight: '100vh' }}
    >
      <Grid item xs={3}>
        <Box sx={{ display: 'flex' }}>
          <CircularProgress size="4rem" />
        </Box>
      </Grid>
    </Grid>
  </> :
    <Grid container className="App">
      <Grid
        container
        className="App-header"
        justifyContent="center"
        alignItems={"center"}
      >
        <ConferenceContext.Provider
          value={{
            isScreenShared,
            talkers,
            screenSharedVideoId,
            roomJoinMode,
            audioTracks,
            isPublished,
            selectedCamera,
            selectedMicrophone,
            selectedBackgroundMode,
            participants,
            messageDrawerOpen,
            participantListDrawerOpen,
            messages,
            numberOfUnReadMessages,
            pinnedVideoId,
            participantUpdated,
            allParticipants,
            globals,
            isPlayOnly,
            localVideo,
            streamName,
            initialized,
            devices,
            publishStreamId,
            isMyMicMuted,
            isMyCamTurnedOff,
            sendReactions,
            setSelectedBackgroundMode,
            setIsVideoEffectRunning,
            setParticipants,
            handleMessageDrawerOpen,
            handleParticipantListOpen,
            setSelectedCamera,
            setSelectedMicrophone,
            setLeftTheRoom,
            joinRoom,
            handleStopScreenShare,
            handleStartScreenShare,
            cameraSelected,
            microphoneSelected,
            handleBackgroundReplacement,
            muteLocalMic,
            unmuteLocalMic,
            checkAndTurnOnLocalCamera,
            checkAndTurnOffLocalCamera,
            setAudioLevelListener,
            handleSetMessages,
            toggleSetNumberOfUnreadMessages,
            pinVideo,
            setLocalVideo,
            setWaitingOrMeetingRoom,
            setStreamName,
            handleLeaveFromRoom,
            handleSendNotificationEvent,
            handleSetMaxVideoTrackCount,
            screenShareOffNotification,
            handleSendMessage,
            turnOffYourMicNotification,
            turnOnYourMicNotification,
            turnOffYourCamNotification,
            addFakeParticipant,
            removeFakeParticipant,
            assignVideoToStream,
            showEmojis,
            setShowEmojis,
            isMuteParticipantDialogOpen,
            setMuteParticipantDialogOpen,
            participantIdMuted,
            setParticipantIdMuted,
            videoSendResolution,
            setVideoSendResolution,
            presenters,
            makeListenerAgain,
            makeParticipantUndoPresenter,
            approvedSpeakerRequestList,
            setPresenters,
            restBaseUrl,
            handlePublisherRequestListOpen,
            requestSpeakerList,
            setRequestSpeakerList,
            publisherRequestListDrawerOpen,
            isListener,
            isAdmin,
            roomName,
            isFakeeh,
            makeParticipantPresenter,
            rejectSpeakerRequest,
            approveBecomeSpeakerRequest,
            setPublisherRequestListDrawerOpen,
            resetAllParticipants,
            displayNoVideoAudioDeviceFoundWarning,
            getAllParticipants,
            resetPartipants,
            changeRoomName,
            addBecomingPublisherRequest,
            handleSendMessageAdmin,
            presenterButtonDisabled,
            isBroadcasting,
            deleteListenerRoom
          }}
        >
          <SnackbarProvider
            anchorOrigin={{
              vertical: "top",
              horizontal: "center",
            }}
            maxSnack={3}
            content={(key, notificationData) => (
              <AntSnackBar id={key} notificationData={notificationData} />
            )}
          >
            {leftTheRoom ? (
              <LeftTheRoom />
            ) : waitingOrMeetingRoom === "waiting" ? (
              <WaitingRoom />
            ) : (
              <>
                <MeetingRoom />
                <MessageDrawer />
                <ParticipantListDrawer />
                <PublisherRequestListDrawer />
              </>
            )}
          </SnackbarProvider>
        </ConferenceContext.Provider>
      </Grid>
    </Grid>
  );
}

export default AntMedia;
