import React from "react";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import { SvgIcon } from "./SvgIcon";
import { ConferenceContext } from "pages/AntMedia";

const ParticipantName = styled(Typography)(({ theme }) => ({
  color: "black",
    // FIXME: color: "#ffffff",
  fontWeight: 500,
  fontSize: 14,
}));

const PinBtn = styled(Button)(({ theme }) => ({
  "&:hover": {
    backgroundColor: theme.palette.green[50],
  },
}));

function ParticipantTab(props) {
  const conference = React.useContext(ConferenceContext);
  const getParticipantItem = (streamId, name, assignedVideoCardId) => {
    return (
      <Grid
        key={streamId}
        container
        alignItems="center"
        justifyContent="space-between"
        style={{ borderBottomWidth: 1 }}
        sx={{ borderColor: "primary.main" }}
      >
        <Grid item sx={{ pr: 1 }}>
          <ParticipantName variant="body1">{name}</ParticipantName>
        </Grid>
        <Grid item>
          {conference.pinnedVideoId === assignedVideoCardId ? (
            <PinBtn
              sx={{ minWidth: "unset", pt: 1, pb: 1 }}
              onClick={() => conference.pinVideo(assignedVideoCardId)}
            >
                <SvgIcon size={28} name="unpin" color="black" />
            </PinBtn>
          ) : (
            <PinBtn
              sx={{ minWidth: "unset", pt: 1, pb: 1 }}
              onClick={() => {
                if(assignedVideoCardId === undefined) {
                  //if videoTrackId is undefined, then it means that we try to pin someone who has no video player on the screen
                  //then we will assign the 1st player in the screen to that user

                  conference.assignVideoToStream(conference.participants[1].id, streamId);
                  //conference.pinVideo(conference.participants[1].id);
                }
                else {
                  conference.pinVideo(assignedVideoCardId);
                }
              }}
            >
              <SvgIcon size={28} name="pin" color="black" />
            </PinBtn>
          )}
          {(assignedVideoCardId === "localVideo" ? conference.presenters.includes(conference.publishStreamId) : conference.presenters.includes(assignedVideoCardId) )&& conference.admin === true ? (
              <PinBtn
                  sx={{ minWidth: "unset", pt: 1, pb: 1 }}
                  onClick={() => conference.makeParticipantUndoPresenter(assignedVideoCardId)}
              >
                <SvgIcon size={28} name="unpresenter" color="black" />
              </PinBtn>
          ) : null}
          {(assignedVideoCardId === "localVideo" ? !conference.presenters.includes(conference.publishStreamId) : !conference.presenters.includes(assignedVideoCardId) ) && ( !conference.approvedSpeakerRequestList.includes(assignedVideoCardId) ) && conference.admin === true ?(
              <PinBtn
                  sx={{ minWidth: "unset", pt: 1, pb: 1 }}
                  onClick={() => conference.makeParticipantPresenter(assignedVideoCardId)}
              >
                {/* this icon for publish speaker */}
                <SvgIcon size={28} name="presenter" color="black" />
              </PinBtn>
          ) : null}
          {conference.approvedSpeakerRequestList.includes(assignedVideoCardId) && conference.admin === true  && assignedVideoCardId !== 'localVideo' ?(
              <PinBtn
                  sx={{ minWidth: "unset", pt: 1, pb: 1 }}
                  onClick={() => conference.makeListenerAgain(assignedVideoCardId)}
              >
                <SvgIcon size={28} name="close" color="black" />
              </PinBtn>
          ) : null}
        </Grid>
      </Grid>
    );
  };
  return (
        <div style={{width: "100%", overflowY: "auto"}}>
          <Stack sx={{width: "100%",}} spacing={2}>
            <Grid container>
              <SvgIcon size={28} name="participants" color="black"/>
              {/* this the icon of how many speakers */}
              <ParticipantName
                  variant="body2"
                  style={{marginLeft: 4, fontWeight: 500}}
              >
                {Object.keys(conference.allParticipants).length}
              </ParticipantName>
            </Grid>
            {conference.isListener === false ? getParticipantItem("localVideo", "You") : ""}
            {Object.entries(conference.allParticipants).map(([streamId, broadcastObject]) => {
              if (conference.publishStreamId !== streamId) {
                var assignedVideoCardId = conference.participants.find(p => p.streamId === streamId)?.id;
                return getParticipantItem(streamId, broadcastObject.name, assignedVideoCardId);
              } else {
                return "";
              }
            })}
          </Stack>
        </div>
    );

}

export default ParticipantTab;
