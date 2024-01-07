import React from "react";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import styled from "@mui/material/styles/styled";
import InfoButton from "./Components/InfoButton";
import MicButton from "./Components/MicButton";
import RequestPublishButton from "./Components/RequestPublishButton";
import CameraButton from "./Components/CameraButton";
import OptionButton from "./Components/OptionButton";
import ShareScreenButton from "./Components/ShareScreenButton";
import ParticipantListButton from "./Components/ParticipantListButton";
import EndCallButton from "./Components/EndCallButton";
import FakeParticipantButton from "./Components/FakeParticipantButton";
import TimeZone from "./Components/TimeZone";
import PublisherRequestListButton from "./Components/PublisherRequestListButton";
import { ConferenceContext } from 'pages/AntMedia';
import ReactionsButton from "./Components/ReactionsButton";

const CustomizedGrid = styled(Grid)(({ theme }) => ({
  backgroundColor: theme.palette.green[80],
  position: "absolute",
  bottom: 0,
  left: 0,
  padding: 16,
  width: "100%",
  zIndex: 2,
  height: 80,
}));
function Footer(props) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const conference = React.useContext(ConferenceContext);

    /*
    {conference.isAdmin == "true" ?
                    <Grid item xs={0}>
                      <PublisherRequestListButton footer />
                    </Grid>
                      : null}

                  {conference.isListener !== false ?
                      <Grid item xs={0}>
                        <RequestPublishButton footer/>
                      </Grid>
                      : null}
     */

    return (
        <CustomizedGrid
            container
            alignItems={"center"}
            justifyContent={{xs: "center", sm: "space-between"}}
        >
          <Grid item sx={{display: {xs: "none", sm: "block"}}}>
            <Grid container alignItems={"center"}>
              <Typography color="black" variant="body1">
                {conference.roomName}
              </Typography>
              <InfoButton/>
            </Grid>
          </Grid>
              <Grid item>
                <Grid
                    container
                    justifyContent="center"
                    columnSpacing={{xs: 1, sm: 2}}
                >
                  <Grid item xs={0}>
                    <OptionButton footer/>
                  </Grid>

                  {conference.isListener === false ?
                  <Grid item xs={0}>
                    <CameraButton {...props} footer/>
                  </Grid>
                    : null}

                  {conference.isListener === false ?
                  <Grid item xs={0}>
                    <MicButton footer/>
                  </Grid>
                      : null}

                  {conference.isListener === false ?
                  <Grid item xs={0}>
                    {" "}
                    <ShareScreenButton footer/>
                  </Grid>
                      : null}

                    {conference.isFakeeh === false ?
                  <Grid item xs={0} style={{display: '-webkit-inline-box'}}>
                    <ReactionsButton footer/>
                  </Grid>
                    : null}

                  {conference.isListener === false ?
                  <Grid item xs={0}>
                      <ParticipantListButton footer />
                  </Grid>
                 : null}

                  <Grid item xs={0}>
                    <EndCallButton footer/>
                  </Grid>
                  {process.env.NODE_ENV === "development" && conference.isFakeeh === false ?
                  <Grid item xs={0}>
                    <FakeParticipantButton
                      footer
                      increment={true}
                    />
                  </Grid>
                  : null}

                  {process.env.NODE_ENV === "development" && conference.isFakeeh === false ?
                  <Grid item xs={0}>
                    <FakeParticipantButton
                      footer
                      increment={false}
                    />
                  </Grid>
                  : null}

                </Grid>
              </Grid>

          <Grid item sx={{display: {xs: "none", sm: "block"}}}>
            <TimeZone/>
          </Grid>
        </CustomizedGrid>
    );
}

export default Footer;
