# Enquiry tablet camera photo

Version: V26.07.27.03

The reception Enquiries Tablet Mode now includes a touch-friendly **Take photo** control.

- Uses the device rear camera where the browser supports `capture="environment"`.
- Falls back to the normal image picker when direct camera capture is unavailable.
- Uploads each photo before enquiry submission through the existing signed Supabase enquiry-correspondence upload flow.
- Shows a thumbnail preview, file size, remove control and **Take another photo** option.
- Supports multiple reference photos on the same enquiry.
- Disables enquiry submission while a photo is still uploading.
- Stores the photos as normal enquiry correspondence so they appear in the existing enquiry attachment/photo preview area.
- Leaves the normal Enquiries page and its email/file upload workflow unchanged.
