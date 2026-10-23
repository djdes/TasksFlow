package ru.tasksflow.app;

/**
 * Chrome передаёт сюда уведомления сайта (Web Push), и Android показывает
 * их от имени TasksFlow, а разрешение на уведомления — разрешение приложения.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
}
