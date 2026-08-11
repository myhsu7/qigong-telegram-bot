import { Api } from 'grammy';

let telegramApi: Api | null = null;

export const configureTelegramApi = (api: Api) => {
    telegramApi = api;
};

export const getTelegramApi = () => {
    if (!telegramApi) throw new Error('Telegram API has not been configured');
    return telegramApi;
};
