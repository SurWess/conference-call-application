import React from "react";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import { SvgIcon } from "./SvgIcon";
import { ConferenceContext } from "pages/AntMedia";
import {CustomizedBtn} from "./Footer/Components/MicButton";
import {useTheme} from "@mui/material";
import virtualBackgroundImageData from 'virtualBackground.json';
import {useSnackbar} from "notistack";
import {useTranslation} from "react-i18next";

function EffectsTab() {
  const conference = React.useContext(ConferenceContext);
  const { t } = useTranslation();
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    const maxSize = 1024 * 1024; // 1MB

    if (selectedFile && selectedFile.size > maxSize) {
      console.error("Image size cannot exceed more than 1MB");
      enqueueSnackbar({
        message: t('Image size cannot exceed more than 1MB.'),
        variant: 'info'
      }, {
        autoHideDuration: 2500,
      });
    } else {
      conference.saveCustomBackgroundImageToLocalStorage(selectedFile);
    }
  };

  function getVirtualBackgroundButton(imageSrc, i) {
    return <Grid item key={i}>
      <CustomizedBtn
        style={{background: theme.palette.themeColor[60], marginRight: 10, marginBottom: 10}}
        id="mic-button" onClick={(e) => {
        conference.setAndEnableVirtualBackgroundImage(imageSrc);
      }}>
        <img width={40} height={40} src={imageSrc}
             alt={"virtual background image " + i}></img>
      </CustomizedBtn>
    </Grid>;
  }

  const getBackgroundImages = () => {
    const images = [];
    for (let i = 0; i < virtualBackgroundImageData.virtualBackgroundImages.length; i++) {
      images.push(
        getVirtualBackgroundButton(virtualBackgroundImageData.virtualBackgroundImages[i], i)
      );
    }
    let customBackgroundImage = localStorage.getItem("customBackgroundImage");
    if (customBackgroundImage !== null) {
      images.push(
        getVirtualBackgroundButton(customBackgroundImage, virtualBackgroundImageData.virtualBackgroundImages.length+1)
      );
    }
    return images;
  };

  return (
        <div style={{width: "100%", overflowY: "auto"}}>
          <Stack sx={{width: "100%",}} spacing={2}>
            <Grid container>
              <p>No effect & blur</p>
            </Grid>
            <Grid container>
              <CustomizedBtn
                style={{background: theme.palette.themeColor[60], marginRight: 10}}
                id="remove-effect-button" onClick={(e) => {
                conference.handleBackgroundReplacement("none");
              }}>
                <SvgIcon size={40} name={'remove-effect'} color="#fff"/>
              </CustomizedBtn>
              <CustomizedBtn
                style={{background: theme.palette.themeColor[60], marginRight: 10}}
                id="blur-button" onClick={(e) => {
                conference.handleBackgroundReplacement("blur");
              }}>
                <SvgIcon size={40} name={'blur'} color="#fff"/>
              </CustomizedBtn>
            </Grid>
            <Grid container>
              <p>Backgrounds</p>
            </Grid>
            <input type="file" accept=".jpg, .jpeg, .png" style={{display: "none"}} onChange={handleFileChange} id="imageInput"/>
            <Grid container>
              <Grid item key={"add-background-image"}>
                <CustomizedBtn
                  style={{
                    background: theme.palette.themeColor[60],
                    marginRight: 10,
                    marginBottom: 10,
                    width: 40,
                    height: 60
                  }}
                  id="upload-background-image-button" onClick={(e) => {
                  document.getElementById("imageInput").click();
                }}>
                  <SvgIcon size={40} name={'add-background-image'} color="#fff"/>
                </CustomizedBtn>
              </Grid>
              {getBackgroundImages()}
            </Grid>
          </Stack>
        </div>
  );

}

export default EffectsTab;
