# Production Manager V26.10.21.01

## Artwork Approval proof PDF specification fix

- Fixed the emailed/downloadable Artwork Approval proof PDF Sign Specification panel.
- Specification values were being calculated correctly but only the labels were appended to the PDF content stream.
- The PDF now renders the actual Substrate, Imaging / Print, Laminate / Finish, Cut / Shape, Pickup / Delivery / Install, Finished Size, Quantity and any other populated specification rows.
- Existing artwork approvals do not need to be recreated; regenerating/sending the proof PDF after deployment uses the saved specification data already attached to the approval.
