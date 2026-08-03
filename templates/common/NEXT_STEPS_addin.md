# Next Steps

Your `{{NAME}}` add-in is ready to go -- the manifest ID, description, author, and version are already filled in, and `config.py`'s `COMPANY_NAME` is already set to what you entered.

1. Move (or keep) the `{{NAME}}` folder wherever you like. Fusion's default Add-Ins directory is:
   * **Windows:** `%appdata%\Autodesk\Autodesk Fusion 360\API\Addins`
   * **Mac:** `~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/Addins`
2. In Fusion, press `Shift + S` to open the **Scripts and Add-Ins** dialog.
3. If you didn't use the default directory, click the **"+"** icon next to the search box and select **Script or add-in from device** to add the `{{NAME}}` folder.
4. Make sure the **Add-Ins** filter checkbox is checked, select `{{NAME}}`, check **Run on Startup** if you want it to load automatically, then click **Run**.

If you picked the Palette tier, use the toolbar button to open it and start replacing the example field in the **Main** tab with your add-in's real feature.
