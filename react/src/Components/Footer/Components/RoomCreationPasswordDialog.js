import * as React from 'react';
import PropTypes from 'prop-types';
import DialogTitle from '@mui/material/DialogTitle';
import Dialog from '@mui/material/Dialog';
import Button from '@mui/material/Button';
import DialogContent from '@mui/material/DialogContent';
import Input from '@mui/material/Input';
import { SvgIcon } from 'Components/SvgIcon';
import { useTranslation } from 'react-i18next';

const AntDialogTitle = props => {
  const { children, onClose, ...other } = props;

  return (
    <DialogTitle {...other}>
      {children}
      {onClose ? (
        <Button
          aria-label="close"
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 26,
            top: 27,
          }}
        >
          <SvgIcon size={30} name={'close'} color={'white'} />
        </Button>
      ) : null}
    </DialogTitle>
  );
};

export function RoomCreationPasswordDialog(props) {
  const { t } = useTranslation();
  const { onClose, password, onPasswordChange, open, onCreateRoomClicked } = props;

  const handleClose = React.useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePasswordChange = React.useCallback(
    (event) => {
      onPasswordChange(event.target.value);
    },
    [onPasswordChange]
  );

  const createRoomClicked = React.useCallback(() => {
    onCreateRoomClicked();
  }, [onCreateRoomClicked]);

  return (
    <Dialog onClose={handleClose} open={open}  maxWidth={'sm'}>
      <AntDialogTitle onClose={handleClose}>{t('Room creation requires password.')}</AntDialogTitle>
      <span>
      Enter room creation password
      </span>
      <DialogContent>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
      
      <Input
          style={{marginTop:'15px'}}
          type='password'
          value={password}
          onChange={handlePasswordChange}
          placeholder="Enter password"
        />

        </div>
   
        <Button
                  style={{marginTop:'35px'}}

            onClick={createRoomClicked}
            size='medium'
            color="secondary"
            variant="contained"
            type="submit"
            id="create_room_button"
        >
        {t("Create Room")}
        </Button>


      </DialogContent>
    </Dialog>
  );
}

RoomCreationPasswordDialog.propTypes = {
  onClose: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
};
