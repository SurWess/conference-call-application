import React, { useContext } from "react";
import Button from "@mui/material/Button";
import { SvgIcon } from "../../SvgIcon";
import {Dialog, DialogContent, DialogTitle, Tooltip} from "@mui/material";
import { styled } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { ConferenceContext } from "pages/AntMedia";
import DialogActions from "@mui/material/DialogActions";

const CustomizedBtn = styled(Button)(({ theme }) => ({
  '&.footer-icon-button': {

    height: '100%',
    [theme.breakpoints.down('sm')]: {
      padding: 8,
      minWidth: 'unset',
      width: '100%',
    },
    '& > svg': {
      width: 26
    },
  }
}));

function EndCallButton({ footer, ...props }) {
  const conference = useContext(ConferenceContext);

  const [openConfirmationDialog, setOpenConfirmationDialog] = React.useState(false);

  const endCall = () =>
  {
    if (conference.isAdmin == "true" && (conference.presenters.length > 0 || conference.approvedSpeakerRequestList.length > 0))
    {
      setOpenConfirmationDialog(true);
    }
    else
    {
      conference.setLeftTheRoom(true);
    }
  };

  const handleClose = () => {
    setOpenConfirmationDialog(false);
  };

  const handleExitAllRooms = () => {
    console.log("presenters.length: " + conference.presenters.length)
    console.log("approved speaker list length: " + conference.approvedSpeakerRequestList.length);
    //get streams from speaker room
    for (let presenter of conference.presenters)
    {
      conference.makeParticipantUndoPresenter(presenter)
      console.log("presenter: " + presenter + " roomname: " + conference.roomName);
    }

    for (let approvedSpeaker of conference.approvedSpeakerRequestList)
    {
      conference.makeListenerAgain(approvedSpeaker)
      console.log("approvedSpeaker : " + approvedSpeaker + " roomname: " + conference.roomName);
    }
    conference.deleteListenerRoom();
    //delete streams from speaker room
    conference.setPresenters([]);
    setOpenConfirmationDialog(false);
    conference.setLeftTheRoom(true);
  }

  const { t } = useTranslation();

  return (
    <>
    <Tooltip title={t('Leave call')} placement="top">
      <CustomizedBtn onClick={() => endCall() } className={footer ? 'footer-icon-button' : ''} variant="contained" color="error">
        <SvgIcon size={28} name={"end-call"} />
      </CustomizedBtn>
    </Tooltip>
     <Dialog
          open={openConfirmationDialog}
          aria-labelledby="scroll-dialog-title"
          aria-describedby="scroll-dialog-description"
      >
        <DialogTitle> Closing Call </DialogTitle>
     <DialogContent
         id="scroll-dialog-description"
         ref={null}
         tabIndex={-1}
     >
      Speakers in the listener room will also be removed. Are you sure to proceed?
     </DialogContent>
   <DialogActions>
     <Button onClick={handleClose}>Cancel</Button>
     <Button onClick={handleExitAllRooms}>OK</Button>
   </DialogActions>
 </Dialog>
 </>
  );
}

export default EndCallButton;
