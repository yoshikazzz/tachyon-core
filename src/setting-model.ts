import {
  AsyncStorage,
} from 'react-native';

class SettingModel {
  public setItem(key: string, value: string) {
    return new Promise((done, fail) => {
      AsyncStorage.setItem(key, value).then(_ => done(value)).catch(fail);
    });
  }

  public getItem(key) {
    return AsyncStorage.getItem(key);
  }
}

export default new SettingModel();
